import { Node } from '../components/node';
import { Port } from '../components/port';
import { Connection } from '../components/connection';
import { Entity } from '../components/component';
import { AddNodeParams } from '../editor/types';
import { ConnectionStyle, StyleManager, StyleStateParams } from '../styles/styles';
import { EventBus } from '../events/eventBus';
import { EventType } from '../events/eventType';
import { Position } from '../../utils/interfaces';

/** Owns graph membership and keeps both endpoints consistent for every mutation. */
export class GraphModel {
  private nodes = new Map<string, Node>();
  private connections = new Map<string, Connection>();

  constructor(
    private styles: StyleManager,
    private events: EventBus,
  ) {}

  public getNodes(): Node[] {
    return [...this.nodes.values()];
  }
  public getConnections(): Connection[] {
    return [...this.connections.values()];
  }
  public getNodeById(id: string): Node | undefined {
    return this.nodes.get(id);
  }
  public getConnectionById(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  public ownsPort(port: Port): boolean {
    return (
      !!port.node &&
      this.nodes.get(port.node.id) === port.node &&
      port.node.ports.includes(port)
    );
  }

  private assertAvailableIds(ids: (string | undefined)[]): void {
    const used = new Set([
      ...this.nodes.keys(),
      ...this.connections.keys(),
      ...this.getNodes().flatMap((node) => node.ports.map((port) => port.id)),
    ]);
    for (const id of ids) {
      if (id === undefined) continue;
      if (typeof id !== 'string' || !id || used.has(id))
        throw new Error('Graph IDs must be non-empty and unique');
      used.add(id);
    }
  }

  public addNode(params: AddNodeParams & { position: Position }): Node {
    this.assertAvailableIds([params.id, ...(params.ports ?? []).map((port) => port.id)]);
    const style = this.styles.getTransitionableProps({
      ...this.styles.getDefaultStyles().node,
      ...params.style,
    });
    if (
      !Number.isFinite(style.width) ||
      !Number.isFinite(style.height) ||
      style.width <= 0 ||
      style.height <= 0
    ) {
      throw new Error('Node dimensions must be positive finite numbers');
    }
    if (!Number.isFinite(params.position.x) || !Number.isFinite(params.position.y)) {
      throw new Error('Position coordinates must be finite numbers');
    }
    for (const port of params.ports ?? []) {
      if (!['input', 'output'].includes(port.type) || !Number.isFinite(port.position.y)) {
        throw new Error('Ports require an input/output type and finite position');
      }
    }
    const ports = (params.ports ?? []).map(
      (port) =>
        new Port({
          id: port.id,
          type: port.type,
          position: {
            x: port.type === 'input' ? 0 : style.width,
            y: Math.min(style.height, Math.max(0, port.position.y)),
          },
          style: port.style,
          styleManager: this.styles,
        }),
    );
    const node = new Node({ ...params, ports, styleManager: this.styles });
    this.nodes.set(node.id, node);
    this.styles.invalidate();
    return node;
  }

  public connectPorts(
    source: Port,
    target: Port,
    options: { id?: string; style?: StyleStateParams<ConnectionStyle> } = {},
  ): Connection | undefined {
    if (!this.ownsPort(source) || !this.ownsPort(target))
      throw new Error('Both ports must belong to this editor');
    if (source.type === target.type) throw new Error('Cannot connect ports of the same type');
    if (source.node === target.node) return;
    if (source.type === 'input') [source, target] = [target, source];
    const existing = this.getConnections().find(
      (connection) => connection.sourcePort === source && connection.targetPort === target,
    );
    if (existing) return existing;
    this.assertAvailableIds([options.id]);
    const connection = new Connection(source, target, this.styles, options, (connection) =>
      this.disconnect(connection),
    );
    this.connections.set(connection.id, connection);
    source.connections.push(connection);
    target.connections.push(connection);
    this.events.emit(EventType.PORT_CONNECTED, { port: source, connectedPort: target });
    this.styles.invalidate();
    return connection;
  }

  public disconnect(connection: Connection): void {
    if (this.connections.get(connection.id) !== connection) return;
    this.connections.delete(connection.id);
    for (const port of [connection.sourcePort, connection.targetPort]) {
      port.connections = port.connections.filter((candidate) => candidate !== connection);
    }
    this.styles.deleteConnectionStyle(connection);
    this.removed(connection);
    this.events.emit(EventType.PORT_DISCONNECTED, {
      port: connection.sourcePort,
      disconnectedPort: connection.targetPort,
    });
  }

  public removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    for (const connection of this.getConnections()) {
      if (connection.sourcePort.node === node || connection.targetPort.node === node)
        this.disconnect(connection);
    }
    this.nodes.delete(id);
    for (const port of node.ports) {
      this.styles.deletePortStyle(port);
      this.removed(port);
    }
    this.styles.deleteNodeStyle(node);
    this.removed(node);
  }

  public clear(): void {
    for (const id of this.nodes.keys()) this.removeNode(id);
  }

  private removed(entity: Entity): void {
    this.events.emit(EventType.ENTITY_REMOVED, { entity });
    this.styles.invalidate();
  }
}
