// Diff de texto línea a línea (y palabra a palabra, opcional) usando LCS
// (longest common subsequence) implementado a mano, sin dependencias externas.
// Pensado para el versionado de contenido del Módulo 7: comparar dos versiones
// del mismo tema y resaltar qué cambió de una a otra.

export type DiffUnit = {
  type: "same" | "added" | "removed";
  text: string;
};

export type DiffLine = DiffUnit;

// Núcleo del algoritmo: LCS sobre dos listas de strings (líneas o palabras).
// Construye la tabla de longitudes de LCS y luego hace backtracking para
// emitir la secuencia de operaciones (same/added/removed).
function lcsStringDiff(a: string[], b: string[]): DiffUnit[] {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = longitud del LCS de a[i..] y b[j..]. Se rellena desde el final
  // para que el backtracking avance hacia delante (orden natural de lectura).
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffUnit[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: a[i] });
      i++;
    } else {
      result.push({ type: "added", text: b[j] });
      j++;
    }
  }
  // Cola: lo que quede de a (quitadas) o de b (añadidas).
  while (i < m) {
    result.push({ type: "removed", text: a[i] });
    i++;
  }
  while (j < n) {
    result.push({ type: "added", text: b[j] });
    j++;
  }

  return result;
}

// Diff línea a línea: divide cada texto por saltos de línea y compara.
// Una cadena vacía se trata como cero líneas (no como una línea vacía),
// de modo que añadir un texto desde nada produzca solo líneas "added".
export function lineDiff(a: string, b: string): DiffLine[] {
  const aLines = a === "" ? [] : a.split("\n");
  const bLines = b === "" ? [] : b.split("\n");
  return lcsStringDiff(aLines, bLines);
}

// Diff palabra a palabra para resaltados intra-línea (opcional). Tokeniza
// conservando los espacios como tokens propios para que la salida se pueda
// reconstruir concatenando los textos.
export function diffWords(a: string, b: string): DiffUnit[] {
  const tokenize = (s: string): string[] => s.split(/(\s+)/).filter((t) => t.length > 0);
  return lcsStringDiff(tokenize(a), tokenize(b));
}
