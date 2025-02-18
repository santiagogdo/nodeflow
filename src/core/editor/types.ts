import { NodeStyle } from '../styles/styles';

import { Position } from '../../utils/interfaces';
import { PortStyle, StyleStateParams } from '../styles/styles';
import { ComponentParams } from '../components/component';

export interface AddNodeParams extends ComponentParams {
  data?: Record<string, any>;
  ports?: Array<AddPortParams>;
  label?: string;
  style?: StyleStateParams<NodeStyle>;
}

/** Parameters for defining node ports
 * @param type - 'input' or 'output'
 * @param position - The position of the port on the node (relative to the node position))
 * @param style - The style of the port
 */
interface AddPortParams {
  type: 'input' | 'output';
  position: Position;
  style?: StyleStateParams<PortStyle>;
}

/**
 * Configuration options for the editor's background grid.
 */
export interface GridConfig {
  showCrosses?: boolean;
  showDots?: boolean;
  showMajorLines?: boolean;
  showMinorLines?: boolean;

  /** The size of grid elements in pixels:
   * - For dots: diameter of each dot
   * - For lines: thickness of lines
   */
  size: number;

  /** Color of the grid elements. Supports opacity. Defaults transparent if not specified */
  color?: string;

  /** Distance between grid elements in pixels. Defaults to 20 if not specified */
  spacing?: number;
}

export interface EditorConfig {
  showFPSCounter?: boolean;
  grid?: GridConfig;
  background?: string;
}
