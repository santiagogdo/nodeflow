export enum MouseButton {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
}

export const ButtonType = {
  [MouseButton.LEFT]: 'left',
  [MouseButton.MIDDLE]: 'middle',
  [MouseButton.RIGHT]: 'right',
} as const;

export type ButtonTypeValue = (typeof ButtonType)[MouseButton];
