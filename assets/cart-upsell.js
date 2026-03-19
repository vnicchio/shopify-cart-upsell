/**
 * CartUpsell — Custom Element
 *
 * Renders dynamic product recommendations inside the cart, based on the first
 * product in the cart, using the Shopify Recommendations API exclusively.
 *
 * Approach:
 *  - Fetches cart state via /cart.js on connection and whenever the cart changes.
 *  - Detects cart mutations using PerformanceObserver (resource entries for
 *    /cart/add, /cart/change, /cart/update, /cart/clear) with debounce.
 *  - Filters out products already in the cart before rendering.
 *  - Renders cards from a Liquid-provided <template> element, with a built-in
 *    JS fallback if the template is absent.
 *
 * Usage (Liquid):
 *   {% render 'cart-upsell', title: 'You may also like', recommendations: 4 %}
 *
 * Attributes:
 *   recommendations   {number}  Number of cards to display (default: 4)
 *   data-add-to-cart  {string}  "Add to cart" button label
 *   data-added        {string}  Label shown after adding to cart
 *   data-empty        {string}  Message when no recommendations are available
 *   data-error        {string}  Message shown on fetch failure
 */
class CartUpsell extends HTMLElement {
  constructor() {
    super();

    this.recommendations = parseInt(this.getAttribute("recommendations"), 10) || 4;
    this.cartProducts = [];
    this.recommendationsData = [];
    this.addToCartLabel = this.getAttribute("data-add-to-cart") || "Add to cart";
    this.addedLabel = this.getAttribute("data-added") || "Added!";
    this.emptyLabel = this.getAttribute("data-empty") || "No recommendations available";
    this.errorLabel = this.getAttribute("data-error") || "Error loading recommendations";

    this._performanceObserver = null;
    this._observerTimeout = null;
  }

  connectedCallback() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.loadCart(), { once: true });
    } else {
      this.loadCart();
    }

    this.setupCartObserver();
  }

  disconnectedCallback() {
    if (this._performanceObserver) {
      this._performanceObserver.disconnect();
      this._performanceObserver = null;
    }
    clearTimeout(this._observerTimeout);
  }

  /**
   * Sets up a PerformanceObserver to detect any cart AJAX request and
   * trigger a debounced reload of recommendations.
   * Handles the case where the page load event has already fired.
   */
  setupCartObserver() {
    if (!("PerformanceObserver" in window)) return;

    const cartEndpoints = ["/cart/add", "/cart/change", "/cart/update", "/cart/clear"];

    const init = () => {
      this._performanceObserver = new PerformanceObserver((list) => {
        const hasCartRequest = list
          .getEntries()
          .some((entry) => cartEndpoints.some((endpoint) => entry.name.includes(endpoint)));

        if (hasCartRequest) {
          clearTimeout(this._observerTimeout);
          this._observerTimeout = setTimeout(() => this.loadCart(), 300);
        }
      });

      this._performanceObserver.observe({ entryTypes: ["resource"] });
    };

    if (document.readyState === "complete") {
      init();
    } else {
      window.addEventListener("load", init, { once: true });
    }
  }

  /**
   * Fetches the current cart, then loads and renders recommendations.
   * Renders an empty or error state as appropriate.
   */
  async loadCart() {
    try {
      const response = await fetch("/cart.js");
      if (!response.ok) throw new Error(`Cart fetch failed: ${response.status}`);

      const data = await response.json();
      this.cartProducts = data.items ?? [];

      if (this.cartProducts.length > 0) {
        await this.loadRecommendations();
        if (this.recommendationsData.length > 0) {
          this.renderRecommendations();
        } else {
          this.renderEmpty();
        }
      } else {
        this.renderEmpty();
      }
    } catch (error) {
      this.renderError();
    }
  }

  /**
   * Fetches product recommendations for the first cart item and filters out
   * products already present in the cart.
   * Requests extra items from the API to ensure enough results after filtering.
   */
  async loadRecommendations() {
    const firstProduct = this.cartProducts[0];
    const fetchLimit = this.recommendations + this.cartProducts.length;

    const response = await fetch(
      `/recommendations/products.json?product_id=${firstProduct.product_id}&limit=${fetchLimit}`
    );
    if (!response.ok) throw new Error(`Recommendations fetch failed: ${response.status}`);

    const data = await response.json();
    const cartProductIds = new Set(this.cartProducts.map((item) => item.product_id));
    this.recommendationsData = data.products
      .filter((p) => !cartProductIds.has(p.id))
      .slice(0, this.recommendations);
  }

  renderEmpty() {
    this.innerHTML = `<div class="cart-upsell-empty">${this.emptyLabel}</div>`;
  }

  renderError() {
    this.innerHTML = `<div class="cart-upsell-error">${this.errorLabel}</div>`;
  }

  renderRecommendations() {
    this.innerHTML = `<div class="cart-upsell-recommendations">${this.recommendationsData
      .map((product) => this.renderRecommendation(product))
      .join("")}</div>`;

    this.querySelectorAll(".cart-upsell-add-to-cart").forEach((button) => {
      button.addEventListener("click", () => this.addToCart(button));
    });
  }

  /**
   * Adds a product variant to the cart via AJAX.
   * Cancels any pending observer-triggered reload to avoid a double re-render.
   * On success, refreshes the cart drawer items and reloads recommendations.
   *
   * @param {HTMLButtonElement} button
   */
  async addToCart(button) {
    const variantId = button.dataset.variantId;
    if (!variantId) return;

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = this.addedLabel;

    clearTimeout(this._observerTimeout);

    try {
      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: variantId, quantity: 1 }),
      });

      // Clear any observer timeout set while the fetch was in flight
      clearTimeout(this._observerTimeout);

      if (!response.ok) throw new Error(`Add to cart failed: ${response.status}`);

      await Promise.all([this.refreshCartItems(), this.loadCart()]);
    } catch (error) {
      console.error("CartUpsell: failed to add to cart:", error);
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  /**
   * Refreshes the cart drawer items list without triggering the drawer
   * open/close animation.
   * No-op if the cart-drawer-items element is not present on the page.
   */
  async refreshCartItems() {
    try {
      const response = await fetch(`${window.location.pathname}?section_id=cart-drawer`);
      if (!response.ok) return;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      const newItems = doc.querySelector("cart-drawer-items");
      const currentItems = document.querySelector("cart-drawer-items");
      if (currentItems && newItems) {
        currentItems.innerHTML = newItems.innerHTML;
      }
    } catch {
      // Non-critical: recommendations reload will still proceed
    }
  }

  /**
   * Resolves the best available image URL from a product object.
   * Handles protocol-relative URLs.
   *
   * @param {Object} product
   * @returns {string|null}
   */
  getProductImageUrl(product) {
    const img =
      product.featured_image ||
      product.image ||
      product.images?.[0] ||
      product.variants?.[0]?.featured_image ||
      null;

    if (!img) return null;

    let url = typeof img === "string" ? img : img.src || img.url;
    if (!url) return null;
    if (url.startsWith("//")) url = "https:" + url;

    return url;
  }

  /**
   * Builds the HTML string for a single recommendation card.
   * Uses the Liquid-provided <template> element if available, falls back to
   * inline HTML otherwise.
   *
   * @param {Object} product
   * @returns {string}
   */
  renderRecommendation(product) {
    const imageUrl = this.getProductImageUrl(product);
    const currency = window.Shopify?.currency?.active ?? "USD";
    const price = product.price
      ? (product.price / 100).toLocaleString(undefined, { style: "currency", currency })
      : "";

    const variantId = product.variants?.[0]?.id ?? product.id;
    const productUrl = product.url || (product.handle ? `/products/${product.handle}` : "#");

    const imageHtml = imageUrl
      ? `<img src="${imageUrl}" alt="${this.escapeHtml(product.title)}" class="cart-upsell-image" loading="lazy" width="64" height="64" />`
      : `<div class="cart-upsell-image cart-upsell-image--placeholder" aria-hidden="true"></div>`;

    const priceHtml = price ? `<p class="cart-upsell-price">${price}</p>` : "";
    const disabledAttr = product.available === false ? "disabled" : "";

    const template = document.getElementById("cart-upsell-item-template");
    if (template) {
      return template.innerHTML
        .replace(/\[\[productUrl\]\]/g, this.escapeHtml(productUrl))
        .replace(/\[\[productImageHtml\]\]/g, imageHtml)
        .replace(/\[\[productTitle\]\]/g, this.escapeHtml(product.title))
        .replace(/\[\[productPriceHtml\]\]/g, priceHtml)
        .replace(/\[\[variantId\]\]/g, variantId)
        .replace(/\[\[disabled\]\]/g, disabledAttr);
    }

    return `
      <div class="cart-upsell-product">
        <a href="${this.escapeHtml(productUrl)}" class="cart-upsell-product__link">
          ${imageHtml}
        </a>
        <div class="cart-upsell-product__info">
          <h4 class="cart-upsell-title-product">${this.escapeHtml(product.title)}</h4>
          ${priceHtml}
        </div>
        <button
          type="button"
          class="cart-upsell-add-to-cart"
          data-variant-id="${variantId}"
          ${disabledAttr}
        >
          ${this.escapeHtml(this.addToCartLabel)}
        </button>
      </div>
    `;
  }

  /**
   * Safely escapes a string for HTML output.
   *
   * @param {*} text
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }
}

customElements.define("cart-upsell", CartUpsell);
