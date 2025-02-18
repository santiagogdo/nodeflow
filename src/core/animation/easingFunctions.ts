export type EasingFunction = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) => {
    if (t < 0.5) return 2 * t * t;
    return 1 - Math.pow(-2 * t + 2, 2) / 2;
  },
};

export type EasingType = 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear';

export const getEasingFunction = (type: EasingType): EasingFunction => {
  switch (type) {
    case 'ease-in':
      return Easing.easeIn;
    case 'ease-out':
      return Easing.easeOut;
    case 'ease-in-out':
      return Easing.easeInOut;
    case 'linear':
    default:
      return Easing.linear;
  }
};
