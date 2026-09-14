export const userInitials = (name: string, email: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0];
  const second = parts[1];
  if (first !== undefined && second !== undefined) {
    return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
  }
  if (first !== undefined && first.length >= 2) {
    return first.slice(0, 2).toUpperCase();
  }
  if (first?.[0] !== undefined) {
    return first[0].toUpperCase();
  }
  const fromEmail = email.trim().slice(0, 2);
  return fromEmail.length > 0 ? fromEmail.toUpperCase() : "?";
};
