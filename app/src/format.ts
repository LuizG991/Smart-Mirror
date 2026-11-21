// "joao_silva" / "JOAO silva" -> "Joao Silva"
export function formatarNome(nome: string) {
  return nome
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}
