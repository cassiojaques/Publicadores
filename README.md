# Publicadores

Aplicativo instalável (PWA) para gerenciar os publicadores da congregação: cadastro, grupos de campo
(com superintendente e ajudante), Registro de Publicador (S-21) e importação mensal do relatório de campo.

Os dados ficam **num único arquivo `congregacao.pub`, criptografado com o PIN** (AES-256-GCM, chave via PBKDF2).
Deixe o arquivo numa pasta do OneDrive/Google Drive para ter backup na nuvem.

## Funcionalidades
- Entrada com PIN de 4 dígitos (ou senha mais longa) e bloqueio automático por inatividade.
- Painel com indicadores e pesquisa global (`Ctrl+K`).
- Publicadores: cadastro, filtros por grupo/designação/situação, arquivar quem se mudou.
- Grupos de campo em quadro: arraste publicadores entre grupos, defina superintendente e ajudante.
- Cartão S-21 em tela (editável) e exportação em PDF preenchendo o formulário oficial `S-21_T.pdf`.
- **Extrair dados**: um .zip com os cartões S-21 em pastas (Ativos — pioneiros e outros publicadores por grupo — e
  Inativos) e, na raiz, os cartões de totais, os grupos de campo (ativos) e a lista de emergência por grupo.
- PDF com a lista de todos os grupos.
- Importação do relatório de campo (JSON) com prévia antes de gravar.
- Importação de publicadores a partir de planilha (.xlsx/.csv), criando os grupos automaticamente.
- Funciona offline depois de instalado.
- Aviso de conflito quando o arquivo é alterado por fora (ex.: sincronização do OneDrive).

## Como usar no PC

1. Abra o endereço publicado do app no **Chrome** ou **Edge**.
2. Clique no ícone **Instalar** na barra de endereço (ou menu ⋮ → *Instalar Publicadores*).
   O app ganha ícone no Menu Iniciar e abre em janela própria, mesmo sem internet.
3. Escolha **Abrir arquivo existente** e selecione o `congregacao.pub` (ex.: na pasta do OneDrive) e digite o PIN.
   O navegador pede uma vez por sessão permissão para editar o arquivo.

Para outra pessoa usar: envie o link do app e o arquivo `.pub` (ou compartilhe a pasta do OneDrive).
O programa fica no endereço publicado; **os dados nunca saem do arquivo .pub** no computador de quem usa.
O histórico de versões do OneDrive serve de backup.

## Publicação

O workflow `.github/workflows/pages.yml` publica o app no GitHub Pages a cada push na branch `main`
(em *Settings → Pages*, escolha *Source: GitHub Actions*). Planilhas e arquivos `.pub` estão no `.gitignore`.

## Desenvolvimento

Pré-requisitos: Node 20+. O app desktop (Tauri, em `src-tauri/`) é opcional e exige [Rust](https://rustup.rs) e as
"Desktop development with C++" Build Tools do Visual Studio.

```bash
npm install
npm run dev          # roda no navegador em http://localhost:1420 (use ?local para guardar no navegador)
npm test             # testes (criptografia, ano de serviço, importação, PDFs)
npm run build && npm run preview   # versão instalável (PWA) em http://localhost:4173
npm run tauri dev    # app desktop opcional (requer Rust)
npm run tauri build  # gera o instalador e o .exe em src-tauri/target/release
```

## Estrutura
```
src/crypto/      criptografia do arquivo .pub
src/domain/      tipos e regras (ano de serviço set–ago, totais, situação)
src/storage/     onde o arquivo é lido/gravado (Tauri, navegador ou localStorage)
src/store/       estado global e salvamento automático
src/import/      importador do relatório de campo
src/pdf/         S-21 (formulário oficial) e PDF dos grupos
src/pages/       telas
src-tauri/       app desktop (comandos de arquivo, backups, pacote .zip)
```

## Formato da importação (provisório)
Até recebermos o JSON real do sistema de relatórios, o importador aceita:
```json
{ "mes": "2026-10", "relatorios": [
  { "nome": "Ana Lima", "participou": true, "estudos": 3, "auxiliar": false, "horas": 55, "observacoes": "" }
] }
```
ou uma lista com `mes` em cada item. Os publicadores são casados pelo nome (sem diferenciar acentos/maiúsculas).
