# Cart Upsell — Shopify Theme Component

A lightweight, zero-dependency cart upsell component for Shopify themes. Displays product recommendations inside the cart drawer or cart page based on what the customer already has in the bag — and lets them add suggested items with a single click, without any page reload.

---

## How it works

1. When the component mounts, it fetches the current cart via `/cart.js`.
2. Using the first product in the cart, it requests recommendations from Shopify's native `/recommendations/products.json` endpoint.
3. Products already in the cart are filtered out automatically.
4. The remaining products are rendered using a `<template>` tag defined in Liquid, so the markup is fully customisable.
5. A `PerformanceObserver` watches for requests to `/cart/add`, `/cart/change`, `/cart/update`, and `/cart/clear` — whenever a cart update is detected, the recommendations reload automatically.

---

## File structure

```
assets/
  cart-upsell.css          # Component styles (fully overridable via CSS variables)
  cart-upsell.js           # CartUpsell custom element

sections/
  cart-upsell.liquid       # Section wrapper (adds the component to the theme editor)

snippets/
  cart-upsell.liquid       # Snippet that renders the web component and loads assets
  cart-upsell-item-template.liquid  # Template for each recommendation card
```

---

## Installation

### 1. Add the files

Copy the following files into your theme:

| Source file | Destination |
|---|---|
| `assets/cart-upsell.css` | `assets/` |
| `assets/cart-upsell.js` | `assets/` |
| `sections/cart-upsell.liquid` | `sections/` |
| `snippets/cart-upsell.liquid` | `snippets/` |
| `snippets/cart-upsell-item-template.liquid` | `snippets/` |

### 2. Add translation keys

Add the following keys to your `locales/en.default.json` (and other locale files as needed):

```json
{
  "sections": {
    "cart": {
      "upsell_title": "You may also like",
      "upsell_added": "Added!",
      "upsell_empty": "No recommendations available",
      "upsell_error": "Error loading recommendations"
    }
  }
}
```

### 3. Render inside the cart drawer

Open your cart drawer snippet (e.g. `snippets/cart-drawer.liquid`) and add the snippet render where you want the upsell to appear — typically just above the cart footer:

```liquid
{%- render 'cart-upsell' -%}
```

You can also pass optional parameters:

```liquid
{%- render 'cart-upsell',
  title: 'Complete your look',
  recommendations: 3
-%}
```

### 4. (Optional) Add as a theme editor section

The `sections/cart-upsell.liquid` file registers the component as a configurable section in the Shopify theme editor. Merchants can then add it to any template (e.g. the cart page) and set the title and number of recommendations directly from the editor.

---

## Snippet parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `"You may also like"` | Heading shown above the recommendations |
| `recommendations` | `number` | `4` | Maximum number of products to display |

---

## Section schema settings

When used as a section via the theme editor, merchants can configure:

| Setting | Type | Default |
|---|---|---|
| Title | Text | `"You may also like"` |
| Number of recommendations | Range (1–12) | `4` |

---

## Customisation

### CSS variables

All colours are controlled via CSS custom properties defined on `.cart-upsell-section`. Override them anywhere in your theme CSS:

```css
.cart-upsell-section {
  --cart-upsell-bg: #f5f5f5;
  --cart-upsell-border: #e8e8e8;
  --cart-upsell-card-bg: #ffffff;
  --cart-upsell-price-color: #333333;
  --cart-upsell-btn-bg: #000000;
  --cart-upsell-btn-color: #ffffff;
  --cart-upsell-btn-hover-bg: #333333;
}
```

### Card template

Each recommendation card is rendered using the `<template id="cart-upsell-item-template">` element defined in `snippets/cart-upsell.liquid`. The template uses placeholder tokens that the JavaScript replaces at runtime:

| Token | Replaced with |
|---|---|
| `[[productUrl]]` | Product page URL |
| `[[productImageHtml]]` | `<img>` tag (or placeholder SVG if no image) |
| `[[productTitle]]` | Product title |
| `[[productPriceHtml]]` | `<p>` with formatted price |
| `[[variantId]]` | First available variant ID |
| `[[disabled]]` | `disabled` attribute if the product is unavailable |

Edit `snippets/cart-upsell-item-template.liquid` freely to match your theme's design.

---

## Accessibility

- The loading spinner uses `role="status"` and `aria-label`.
- Buttons that are disabled (sold-out products) use the native `disabled` attribute.
- Product images include descriptive `alt` text from the product title.
- Images use `loading="lazy"` and explicit `width`/`height` attributes to prevent layout shift.

---

## Browser support

Uses the [Custom Elements v1](https://caniuse.com/custom-elementsv1) API and `PerformanceObserver`, both supported in all modern browsers. No polyfills or build tools required.
