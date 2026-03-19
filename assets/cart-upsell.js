class CartUpsell extends HTMLElement {
  constructor() {
    super();

    this.recommendations = parseInt(this.getAttribute("recommendations")) || 4;
    this.cartProducts = [];
    this.recommendationsData = [];
    this.addToCartLabel =
      this.getAttribute("data-add-to-cart") || "Add to cart";
    this.addedLabel = this.getAttribute("data-added") || "Added!";
    this.emptyLabel =
      this.getAttribute("data-empty") || "No recommendations available";
    this.errorLabel =
      this.getAttribute("data-error") || "Error loading recommendations";

    this.init();
  }

  async init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.loadCart());
    } else {
      this.loadCart();
    }

    this.cartObserver();
  }

  cartObserver() {
    window.addEventListener("load", () => {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.name.includes("/cart/add")) {
            this.loadCart();
          }
          if (entry.name.includes("/cart/change")) {
            this.loadCart();
          }
        });
      });

      observer.observe({ entryTypes: ["resource"] });
    });
  }

  async loadCart() {
    try {
      const cart = await fetch("/cart.js");
      const data = await cart.json();
      this.cartProducts = [];
      this.cartProducts = data.items;

      if (this.cartProducts.length > 0) {
        await this.loadRecommendations();
        this.renderRecommendations();
      } else {
        this.renderEmpty();
      }
    } catch (error) {
      console.error("Error to load cart:", error);
      this.renderError();
    }
  }

  async loadRecommendations() {
    try {

    const firstProduct = this.cartProducts[0];
    console.log(firstProduct);
    const response = await fetch(
      `/recommendations/products.json?product_id=${firstProduct.product_id}&limit=${this.recommendations}`,
    );
    const data = await response.json();
    this.recommendationsData = data.products;
    } catch (error) {
      console.error("Error to load recommendations:", error);
      throw new Error("Error to load recommendations:", error);
    }
  }

  renderEmpty() {
    this.innerHTML = `<div class="cart-upsell-empty">${this.emptyLabel}</div>`;
  }

  renderError() {
    this.innerHTML = `<div class="cart-upsell-error">${this.errorLabel}</div>`;
  }

  renderRecommendations() {
    this.innerHTML = `<div class="cart-upsell-recommendations">${this.recommendationsData.map((product) => this.renderRecommendation(product)).join("")}</div>`;
  }

  getProductImageUrl(product) {
    const img =
      product.featured_image ||
      product.image ||
      (product.images && product.images[0]) ||
      (product.variants && product.variants[0] && product.variants[0].featured_image);
    if (!img) return null;
    let url = typeof img === "string" ? img : (img.src || img.url);
    if (!url) return null;
    if (url.startsWith("//")) url = "https:" + url;
    return url;
  }

  renderRecommendation(product) {
    const imageUrl = this.getProductImageUrl(product);
    const price = product.price
      ? (product.price / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })
      : "";

    const variantId =
      product.variants && product.variants[0] ? product.variants[0].id : product.id;
    const productUrl = product.url || (product.handle ? "/products/" + product.handle : "#");

    const imageHtml = imageUrl
      ? `<img src="${imageUrl}" alt="${this.escapeHtml(product.title)}" class="cart-upsell-image" loading="lazy" width="64" height="64" />`
      : `<div class="cart-upsell-image cart-upsell-image--placeholder" aria-hidden="true"></div>`;

    return `
        <div class="cart-upsell-product">
          <a href="${this.escapeHtml(productUrl)}" class="cart-upsell-product__link">
            ${imageHtml}
          </a>
          <div class="cart-upsell-product__info">
            <h4 class="cart-upsell-title-product">${this.escapeHtml(product.title)}</h4>
            ${price ? `<p class="cart-upsell-price">${price}</p>` : ""}
          </div>
          <button type="button" class="cart-upsell-add-to-cart" data-variant-id="${variantId}" ${!product.available ? "disabled" : ""}>
            ${this.escapeHtml(this.addToCartLabel)}
          </button>
        </div>
      `;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define("cart-upsell", CartUpsell);
