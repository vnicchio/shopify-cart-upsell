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

  renderLoading() {
    this.innerHTML = `
      <div class="cart-upsell-loading" role="status" aria-label="${this.getAttribute("data-loading") || "Loading"}">
        <div class="cart-upsell-spinner"></div>
      </div>
    `;
  }

  async loadCart() {
    this.renderLoading();
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
    this.innerHTML = `<div class="cart-upsell-grid">${this.recommendationsData
      .map((product) => this.renderRecommendation(product))
      .join("")}</div>`;

    this.querySelectorAll(".cart-upsell-add-to-cart").forEach((button) => {
      button.addEventListener("click", () => this.addToCart(button));
    });
  }

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

      clearTimeout(this._observerTimeout);

      if (!response.ok) throw new Error(`Add to cart failed: ${response.status}`);

      await Promise.all([this.refreshCartItems(), this.loadCart()]);
    } catch (error) {
      console.error("CartUpsell: failed to add to cart:", error);
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async refreshCartItems() {
    try {
      const [drawerResponse, bubbleResponse] = await Promise.all([
        fetch(`${window.location.pathname}?section_id=cart-drawer`),
        fetch(`${window.location.pathname}?section_id=cart-icon-bubble`),
      ]);

      if (drawerResponse.ok) {
        const html = await drawerResponse.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const newItems = doc.querySelector("cart-drawer-items");
        const currentItems = document.querySelector("cart-drawer-items");
        if (currentItems && newItems) {
          currentItems.innerHTML = newItems.innerHTML;
        }
      }

      if (bubbleResponse.ok) {
        const html = await bubbleResponse.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const newBubble = doc.querySelector(".shopify-section");
        const currentBubble = document.querySelector("#cart-icon-bubble");
        if (currentBubble && newBubble) {
          currentBubble.innerHTML = newBubble.innerHTML;
        }
      }
    } catch {
      // Non-critical: recommendations reload will still proceed
    }
  }

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

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }
}

customElements.define("cart-upsell", CartUpsell);
