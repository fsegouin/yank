import type { ReactElement } from 'react';

export interface IconProps {
  size?: number;
}

export type IconFn = (props?: IconProps) => ReactElement;
