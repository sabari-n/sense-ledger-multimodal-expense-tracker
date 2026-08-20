export function formatIndian(num) {
  const n = Math.abs(Number(num) || 0);
  const str = n.toFixed(2);
  const [intPart, decPart] = str.split('.');
  const lastThree = intPart.slice(-3);
  const remaining = intPart.slice(0, -3);
  const formatted = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (formatted ? formatted + ',' : '') + lastThree + '.' + decPart;
}
