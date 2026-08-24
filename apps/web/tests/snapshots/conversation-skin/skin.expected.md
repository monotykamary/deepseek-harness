# T3-adapted conversation skin

## Light palette

- canvas token: #fcfcfc
- conversation canvas: rgb(252, 252, 252)
- header canvas: rgb(252, 252, 252)
- header divider: rgb(228, 228, 231)
- composer fill: color(srgb 1 1 1 / 0.8)
- composer outline: rgba(0, 0, 0, 0.08)
- composer backdrop: none
- composer radius: 22px
- composer shadow: rgba(0, 0, 0, 0.4) 0px 12px 28px -18px
- user message: rgb(244, 244, 245)
- user message radius: 16px
- user message typography: 15px/24px
- user message maximum width: 80%
- Assistant prose: color(srgb 0.0588235 0.0666667 0.0823529 / 0.8), 15px/24px
- transcript gap: 12px
- title-to-tabs gap: 10px
- settled actions at rest: opacity 0

## Dark palette

- canvas token: #0a0a0a
- conversation canvas: rgb(10, 10, 10)
- header canvas: rgb(10, 10, 10)
- header divider: rgb(25, 25, 25)
- composer fill: color(srgb 0.0776471 0.0776471 0.0776471 / 0.8)
- composer outline: rgba(255, 255, 255, 0.05)
- composer backdrop: none
- composer radius: 22px
- composer shadow: rgba(255, 255, 255, 0.03) 0px 1px 0px 0px inset
- user message: rgb(20, 20, 20)
- user message radius: 16px
- user message typography: 15px/24px
- user message maximum width: 80%
- Assistant prose: color(srgb 0.976471 0.980392 0.984314 / 0.8), 15px/24px
- transcript gap: 12px
- title-to-tabs gap: 10px
- settled actions at rest: opacity 0

## Tablet rail at 800px

- button centers: Open sidebar=28, New session=28, Search sessions=28, Add workspace=28
- icon centers: Open sidebar=28, New session=28, Search sessions=28, Add workspace=28
- button sizes: Open sidebar=36×36, New session=36×36, Search sessions=36×36, Add workspace=36×36
- all centers aligned: true

## Compact drawer at 500px

- action size: 32×32
- panel icon size: 18×18
- resting border: 0px none
- resting background: rgba(0, 0, 0, 0)
- radius: 8px
- title-row center delta: 0px
- gap before Session title: 10px

## Progressive sidebar disclosure

- desktop tracks at 1200px: 280px + 920px
- tablet tracks at 800px: 56px + 744px
- compact tracks at 700px: 0px + 700px
- tablet rail reopens: true
- tablet rail recollapses: true
- compact drawer opens: true
- compact drawer dismisses: true
- compact Chat horizontal overflow: 0px
- mobile header disclosure tier: 0
- mobile header row overflow: 0px

## Trajectory top fade clearance

- view padding: 20px
- toolbar clearance: 20px
- fade height: 20px
- toolbar clears fade: true
