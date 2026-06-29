---
name: Kinetic Grid
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2ec'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#bcc7de'
  on-secondary: '#263143'
  secondary-container: '#3e495d'
  on-secondary-container: '#aeb9d0'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00a572'
  on-tertiary-container: '#00311f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353c'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

This design system is engineered for high-velocity industrial environments where data density and immediate legibility are paramount. The brand personality is authoritative, precise, and resilient. It prioritizes a "function-first" aesthetic, leaning into a **Corporate Modern** style with **Minimalist** efficiency. 

The target audience consists of warehouse managers and floor operators who require a UI that minimizes eye strain during long shifts and highlights critical exceptions (low stock, late shipments) instantly. The emotional response should be one of total control and systematic reliability. Visual clutter is eliminated to make room for complex data tables and real-time inventory metrics.

## Colors

The palette is optimized for low-light warehouse environments using a high-contrast dark mode. 

- **Primary (#3B82F6):** Used for primary actions, active states, and focus indicators. 
- **Secondary / Navy (#1E293B):** Used for surface containers, sidebars, and header backgrounds to provide soft contrast against the #121212 base.
- **Success / In-Stock (#10B981):** A vibrant emerald reserved strictly for positive inventory status and completed tasks.
- **Warning / Low-Stock (#F97316):** A vivid orange-red used to draw immediate attention to stock depletions or system errors.
- **Neutral:** A scale of cool grays is used for borders (#334155) and secondary text (#94A3B8).

## Typography

The system utilizes **Inter** for its exceptional legibility in data-heavy interfaces and tall x-height. For SKU numbers, barcodes, and technical coordinates, **JetBrains Mono** is introduced to ensure character distinction (e.g., distinguishing '0' from 'O').

- **Headlines:** Use Bold weights with slight negative letter spacing to maintain a compact, professional look.
- **Body:** The standard size is 14px (body-md) to allow for high information density without sacrificing readability.
- **Labels:** Use uppercase for table headers and section overviews to create clear visual anchors.
- **Mobile:** On handheld scanning devices, font sizes for primary SKU data should scale up to `headline-sm` to ensure visibility at arm's length.

## Layout & Spacing

The layout follows a **Fluid Grid** model with strict 4px increments (Base-4 system). 

- **Desktop:** 12-column grid with 16px gutters. Sidebars are fixed at 240px to maximize the central data workspace.
- **Tablet/Handheld:** 6-column grid. Used primarily for floor operations; touch targets are increased to a minimum of 44px.
- **Density:** The system supports a "Compact" mode for data tables where vertical padding is reduced from 12px to 8px for expert users managing large manifests.
- **Alignment:** All data points in tables must be top-aligned. Numeric data and SKU codes are tabular-lined for easy vertical scanning.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Low-Contrast Outlines**. In a dark WMS interface, shadows must be used sparingly to avoid "muddiness."

- **Level 0 (Base):** #121212. Background for the entire application.
- **Level 1 (Cards/Tables):** #1E293B. Surfaces that sit directly on the base. Use a subtle 1px border (#334155) instead of shadows.
- **Level 2 (Modals/Popovers):** #1E293B. These elevated elements use a 12% opacity black shadow with a 16px blur to separate them from the content below.
- **Active States:** Elements being interacted with use a 1px solid border of the Primary Blue (#3B82F6) to provide clear focus without shifting the layout.

## Shapes

The design system uses **Soft (0.25rem)** roundedness to maintain a precise, industrial feel while avoiding the harshness of sharp corners. 

- **Standard Elements:** Inputs, buttons, and cards use a 4px (0.25rem) radius.
- **Status Badges:** Use a slightly larger 8px (0.5rem) radius to differentiate them from interactive buttons.
- **Selection Indicators:** Vertical bars used to indicate active menu items should be unrounded on the outer edge to "lock" into the screen border.

## Components

- **Data Tables:** The core of the system. Rows must have a subtle hover state (#2D3748). Columns containing status (In-Stock/Low-Stock) should use tinted background badges rather than just colored text for better peripheral visibility.
- **Action Buttons:** Primary buttons are solid #3B82F6 with white text. Secondary buttons are outlined. All buttons must include an icon (20px) to assist with rapid recognition.
- **Scan Button:** A specialized, high-priority component. It is oversized, uses the Primary Blue, and features a prominent "Barcode" icon. On mobile, this button is often pinned to a bottom-floating action bar.
- **Status Badges:** 
    - *In-Stock:* Emerald text on a 10% opacity emerald background.
    - *Low-Stock:* Orange text on a 10% opacity orange background.
- **Input Fields:** Dark backgrounds (#0F172A) with light borders. The focus state must clearly highlight the entire perimeter in Primary Blue.
- **Inventory Cards:** Used for "Quick Look" dashboard widgets, featuring a large numerical value (JetBrains Mono) and a sparkline indicating stock trends.