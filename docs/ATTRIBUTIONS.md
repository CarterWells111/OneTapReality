# Third-party attributions

## China provincial map

The bundled province and prefecture geometry is generated from the 2023 offline data published by [`cn-atlas`](https://github.com/BarbarossaWang/cn-atlas) under the ISC License at commit `6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f`. The dataset originates from [`ruiduobao/shengshixian.com`](https://github.com/ruiduobao/shengshixian.com), which is distributed under the MIT License.

The committed snapshot is transformed into local SVG boundary paths, a fixed South China Sea inset, and local label coordinates during development. The application renders only these bundled artifacts and does not fetch map tiles or other network resources at runtime.

This visualization is not represented as a replacement for a standard map approved by the relevant natural-resources authority. Release review must continue to verify the map against the applicable approved standard-map requirements.
