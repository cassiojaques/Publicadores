use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const NOME_ARQUIVO: &str = "congregacao.pub";
const MAX_BACKUPS: usize = 30;

#[derive(serde::Serialize)]
struct Leitura {
    conteudo: String,
    mtime: u64,
}

fn mtime(caminho: &Path) -> Result<u64, String> {
    let m = fs::metadata(caminho).map_err(|e| e.to_string())?;
    let t = m.modified().map_err(|e| e.to_string())?;
    Ok(t.duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64)
}

fn pasta_do_exe() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

/// Procura o arquivo de dados: ao lado do executável, depois o último usado,
/// depois qualquer .pub na pasta do executável.
#[tauri::command]
fn localizar_dados(ultimo: Option<String>) -> Option<String> {
    let pasta = pasta_do_exe();
    if let Some(p) = pasta.as_ref().map(|d| d.join(NOME_ARQUIVO)).filter(|p| p.is_file()) {
        return Some(p.to_string_lossy().into_owned());
    }
    if let Some(u) = ultimo.filter(|u| Path::new(u).is_file()) {
        return Some(u);
    }
    let entradas = fs::read_dir(pasta?).ok()?;
    entradas
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|x| x == "pub"))
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn ler_arquivo(caminho: String) -> Result<Leitura, String> {
    let p = Path::new(&caminho);
    let conteudo = fs::read_to_string(p).map_err(|e| format!("Não foi possível ler {caminho}: {e}"))?;
    Ok(Leitura { conteudo, mtime: mtime(p)? })
}

/// Guarda no máximo uma cópia por hora na pasta "backups" ao lado do arquivo.
fn fazer_backup(caminho: &Path) -> Result<(), String> {
    if !caminho.is_file() {
        return Ok(());
    }
    let pasta = caminho.parent().unwrap_or(Path::new(".")).join("backups");
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    let base = caminho.file_stem().and_then(|s| s.to_str()).unwrap_or("dados");
    let destino = pasta.join(format!("{base}-{}.pub", chrono::Local::now().format("%Y%m%d-%H")));
    if !destino.exists() {
        fs::copy(caminho, &destino).map_err(|e| e.to_string())?;
    }
    let mut copias: Vec<PathBuf> = fs::read_dir(&pasta)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.extension().is_some_and(|x| x == "pub")
                && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with(&format!("{base}-")))
        })
        .collect();
    copias.sort();
    while copias.len() > MAX_BACKUPS {
        let _ = fs::remove_file(copias.remove(0));
    }
    Ok(())
}

/// Gravação atômica (arquivo temporário + rename). Se `mtime_esperado` for informado e o arquivo
/// tiver sido alterado por fora desde então, retorna o erro "CONFLITO".
#[tauri::command]
fn gravar_arquivo(caminho: String, conteudo: String, mtime_esperado: Option<u64>) -> Result<u64, String> {
    let p = PathBuf::from(&caminho);
    if let (Some(esperado), true) = (mtime_esperado, p.is_file()) {
        if mtime(&p)? != esperado {
            return Err("CONFLITO".into());
        }
    }
    fazer_backup(&p)?;
    let tmp = p.with_extension("pub.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("Não foi possível gravar: {e}"))?;
        f.write_all(conteudo.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &p).map_err(|e| format!("Não foi possível substituir o arquivo: {e}"))?;
    mtime(&p)
}

#[tauri::command]
fn gravar_bytes(caminho: String, dados: Vec<u8>) -> Result<(), String> {
    fs::write(&caminho, dados).map_err(|e| format!("Não foi possível gravar {caminho}: {e}"))
}

/// Cria um .zip com o executável e o arquivo de dados, prontos para enviar.
#[tauri::command]
fn exportar_pacote(destino: String, caminho_dados: String) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let arquivo = fs::File::create(&destino).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(arquivo);
    let opcoes = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (nome, origem) in [("Publicadores.exe", exe.as_path()), (NOME_ARQUIVO, Path::new(&caminho_dados))] {
        zip.start_file(nome, opcoes).map_err(|e| e.to_string())?;
        zip.write_all(&fs::read(origem).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            localizar_dados,
            ler_arquivo,
            gravar_arquivo,
            gravar_bytes,
            exportar_pacote
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo");
}
