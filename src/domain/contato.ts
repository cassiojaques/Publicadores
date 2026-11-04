/**
 * Link do WhatsApp (wa.me) para um telefone brasileiro digitado de qualquer jeito.
 * Sem código do país, assume o Brasil (55). Devolve null se não parecer um celular/fixo válido.
 */
export function urlWhatsapp(telefone: string): string | null {
  let n = telefone.replace(/\D/g, '').replace(/^0+/, '');
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  // Brasil: 55 + DDD (2) + 8 ou 9 dígitos.
  if (!/^55\d{10,11}$/.test(n)) return null;
  return `https://wa.me/${n}`;
}
