export function buildSlider(
  value: number, min: number, max: number, step: number, onInput: (v: number) => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'rt-slider';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  return input;
}
