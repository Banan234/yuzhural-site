export function formatPhone(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 11 && /^7[78]/.test(digits)) digits = digits.slice(1);
  if (digits.startsWith('7') || digits.startsWith('8'))
    digits = digits.slice(1);
  digits = digits.slice(0, 10);
  let result = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ')';
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  return result;
}
