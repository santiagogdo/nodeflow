# Performance and validation

## Reproduce

1. Run `deno task example` and open **Explore a large graph**.
2. The seeded graph has exactly 1,000 nodes and 2,000 connections, with two
   outgoing edges per node. It contains cycles intentionally; this example
   exercises editing/rendering/layout, not execution.
3. Open View (`⋯` on desktop), then **Measure rendering**. The workbench pans
   for 180 frames and reports render and frame-interval p95 after warm-up.
   Repeat at Fit to exercise the overview.
4. Keep the browser foreground and compare the same hardware, viewport, DPR,
   graph, and scale. Browser scheduling, power state, other work, and headless
   GPU emulation affect results.

## Local reference measurement

Measured during implementation on Apple M1 Pro, arm64, Darwin 27.0.0. These are
local headless browser measurements, not physical-phone results. A 120-frame
deterministic pan discarded the first 11 frames and measured actual editor
render events. The editor emitted zero additional frames during the subsequent
100 ms idle window.

| Browser / canvas                       | Scale      | Render p95 | Frame interval p95 |
| -------------------------------------- | ---------- | ---------- | ------------------ |
| Chromium 153, 1080 × 622 CSS px, DPR 1 | 0.65       | 1.2 ms     | 17.5 ms            |
| Chromium 153, 1080 × 622 CSS px, DPR 1 | Fit, 0.076 | 5.0 ms     | 17.5 ms            |
| WebKit 26.6, 443 × 555 CSS px, DPR 2   | 0.65       | 1 ms       | 18 ms              |
| WebKit 26.6, 443 × 555 CSS px, DPR 2   | Fit, 0.030 | 9 ms       | 18 ms              |

The rendering work fits the 16.7 ms desktop and 33.3 ms mobile budgets on this
machine. Frame intervals include browser scheduling and are reported separately;
this is not a claim of locked 60 FPS or a phone performance guarantee. The
initial overview rendered each connection separately and exceeded the desktop
render budget. Batching paths and removing unreadable text/port detail at far
zoom reduced that case to the numbers above.

## Checks

`deno task check` checks source/example/test types, native Deno headless tests,
dual-format builds, and offline installation of the actual npm tarball. The
install contains one package and no transitive dependencies. Consumer checks
cover ESM/CommonJS type identity across subpaths and a core import compiled
without DOM libraries.

`deno task test:browser` builds the production workbench and its worker, then
covers Chromium, Firefox, WebKit, Pixel 7 emulation, and iPhone 14 emulation.
Local Chromium and WebKit desktop/phone workflows passed. Firefox could not
start its temporary profile on this macOS host
(`Could not find profile folder`), so no local Firefox compatibility claim is
made. Linux CI includes the Firefox project.

The browser suite covers canvas field editing, filtered output,
undo/persistence, drag transaction boundaries and cancellation, worker layout
and undo, nested graph navigation, extraction and duplication, field validation,
simulated composition, keyboard select/slider/custom controls, async branching,
all six examples, mobile panels and simulated pinch, plus desktop
connect/reconnect and graph clipboard events. The same browser suite verifies
idle rendering, coalesced invalidation, coordinate conversion, and disposal of
helpers/subscriptions without jsdom or canvas mocks.

Physical touch devices, on-screen keyboard occlusion, native IME candidate
windows, screen-reader announcements, and mobile GPU performance still require
device acceptance testing. Composition and pinch events in automation validate
routing and state behavior; they do not reproduce every operating-system
interaction.

## Initial glass node pass

With the default glass appearance, the in-app Chromium 153 browser measured a
**1.30 ms render p95** and **17.50 ms frame-interval p95** while panning the
1,000-node / 2,000-connection example at scale 0.65 (794 × 430 canvas, DPR 1,
169 measured frames). This is a separate viewport and run from the earlier
table, not a controlled before/after comparison. Glass blur uses one shared
backdrop snapshot and cropped node regions; compact and overview rendering omit
it. At Fit (approximately 0.05), the optimized overview measured **3.30 ms
render p95** and **17.40 ms frame-interval p95** in the same viewport.

Appearance tests additionally cover complete and partial painter replacement,
custom icon/control isolation, per-node style precedence,
typography/native-input alignment, live reduced-motion changes, settled idle
state, offscreen execution, explicitly disabled motion, and disposal during
animation. Runtime dependencies remain zero in the built tarball.

## Refractive glass refinement

The revised default keeps its center clear and refracts only the rounded
perimeter. One shared backdrop buffer is updated in paint order so overlapping
nodes also contribute to the lens. Blur remains an optional style setting; the
default no longer blurs the whole surface. No additional canvas is allocated per
node.

In-app Chromium 153, 794 × 350 CSS px, DPR 2, 169 measured frames per run:

| Scale                   | Render p95 | Frame interval p95 |
| ----------------------- | ---------- | ------------------ |
| 0.65                    | 1.70 ms    | 17.60 ms           |
| Fit, approximately 0.05 | 2.90 ms    | 17.60 ms           |

The viewport and DPR differ from the initial pass, so these are reference runs,
not a controlled before/after comparison. A new pixel test verifies refraction
over another node, an unchanged clear center, disabling the effect, and a
panned, scaled, partially clipped node. The complete Chromium/WebKit desktop and
phone emulation suite passed 84 checks with four platform-specific skips. All 38
Deno tests, type checking, builds, and the zero-dependency package checks also
passed.

## Connection and port appearance

Connections retain batched paths below scale 0.45; optional outlines and
execution flow are drawn at full detail. Connections and ports now use solid
strokes and fills; their former glass reflections and rims have been removed.
Only visible running connections request continuous frames. Port hover,
connection and focus transitions settle; system reduced motion or per-item
`motion: false` freezes their motion. Connection target compatibility is cached
until the pending connection or scene changes.

Historical measurement before removing glass connections and ports: in-app
Chromium 153, 685 × 662 CSS px, DPR 2, 169 measured frames per run, with the
then-default glass nodes, connections and ports:

| View         | Render p95 | Frame interval p95 |
| ------------ | ---------- | ------------------ |
| Scale 0.65   | 4.50 ms    | 17.60 ms           |
| Fit overview | 3.80 ms    | 18.50 ms           |

These are local reference runs at a different viewport from earlier
measurements. The complete Chromium/WebKit desktop and phone-emulation suite
passed 140 checks with four profile-specific skips. The 40 Deno tests, type
checking, builds and zero-runtime-dependency package checks passed. New coverage
includes per-port appearance layers, full/partial painters, every zoom level,
custom route hit geometry, endpoint dragging,
compatibility/occupancy/reconnection previews, keyboard focus, visible
execution, offscreen idle, motion disabling and disposal.
