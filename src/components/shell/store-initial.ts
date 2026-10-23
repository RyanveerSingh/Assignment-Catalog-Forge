/** The one letter on the store badge: the first letter of the name, upper-cased; "?" when there is none. */
export function storeInitial(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase() : "?";
}
