# Workbench design reference

The approved desktop and mobile concepts are retained here. They are design
references, not screenshots of shipped behavior, and are excluded from the npm
package.

- [Desktop concept](desktop-concept.png)
- [Mobile concept](mobile-concept.png)

The implementation follows the charcoal shell and dot canvas, lavender selection
and primary action, blue data connections, node library, selection inspector,
five-node order pipeline, and output table. System fonts and first-party
SVG/canvas icons keep the runtime self-contained.

The desktop canvas and shell were compared at 1586 × 992. The mobile comparison
uses a 443 × 887 CSS viewport at DPR 2. The mobile workbench uses a compact
initial pipeline arrangement, focuses the selected filter, and exposes
library/selection/view panels in bottom sheets. Runtime status dots,
reusable-definition entries, a large-graph example, and extra editing actions
extend the concept with working library features. The output tabs remain
accessible on phones, and controls use larger touch targets than the visual
sketch.

Control geometry is shared by renderer and input routing. Typography, port rows,
and node dimensions come from the same presentations on every screen; the
surrounding workbench uses CSS responsive layout. The phone demo changes only a
fresh example’s initial positions, never an existing saved graph’s layout when
the viewport changes.
