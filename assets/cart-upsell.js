class CartUpsell extends HTMLElement {
  constructor() {
    super();

    this.recommendations = parseInt(this.getAttribute("recommendations")) || 4;
    this.cartProducts = [];
    this.recommendationsData = [];
    this.addToCartLabel = this.getAttribute("data-add-to-cart") || "Add to cart";
    this.addedLabel = this.getAttribute("data-added") || "Added!";
    this.emptyLabel = this.getAttribute("data-empty") || "No recommendations available";
    this.errorLabel = this.getAttribute("data-error") || "Error loading recommendations";

    this.init();
  }

  async init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.loadCart());
    } else {
      this.loadCart();
    }

    this.addEventListener("click", (e) => this.handleAddToCart(e));
  }

  async loadCart() {
    try {
      const response = await fetch("/cart.js");
      const cart = await response.json();

      if (cart && cart.items && cart.items.length > 0) {
        this.cartProducts = cart.items.map((item) => item.product_id);
        await this.fetchRecommendations();
      } else {
        this.renderEmpty();
      }
    } catch (error) {
      console.error("Error to load cart:", error);
      this.renderError();
    }
  }

  async fetchRecommendations() {
    try {
      const firstProduct = this.cartProducts[0];

      if (!firstProduct) {
        this.renderEmpty();
        return;
      }

      const response = await fetch(
        `/recommendations/products.json?product_id=${firstProduct}&limit=${this.recommendations}`,
      );
      const data = await response.json();

      if (data && data.products) {
        this.recommendationsData = data.products;
        this.renderRecommendations();
      } else {
        this.renderEmpty();
      }
    } catch (error) {
      console.error("Error to fetch recommendations:", error);
      this.renderError();
    }
  }

  renderRecommendations() {
    const filteredRecommendations = this.recommendationsData.filter(
      (product) => !this.cartProducts.includes(product.id),
    );

    if (filteredRecommendations.length === 0) {
      this.renderEmpty();
      return;
    }

    const html = `
        <div class="cart-upsell-container">
          <div class="cart-upsell-grid">
            ${filteredRecommendations.map((product) => this.renderProductCard(product)).join("")}
          </div>
        </div>
      `;

    this.innerHTML = html;
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

  renderProductCard(product) {
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

  renderEmpty() {
    this.innerHTML = `<div class="cart-upsell-empty">${this.escapeHtml(this.emptyLabel)}</div>`;
  }

  renderError() {
    this.innerHTML = `<div class="cart-upsell-error">${this.escapeHtml(this.errorLabel)}</div>`;
  }

  async handleAddToCart(event) {
    const button = event.target.closest(".cart-upsell-add-to-cart");
    if (!button) return;

    const variantId = button.getAttribute("data-variant-id");

    button.disabled = true;
    button.textContent = "Adding...";

    const cart = document.querySelector("cart-notification") || document.querySelector("cart-drawer");

    if (cart && typeof cart.renderContents === "function" && typeof fetchConfig === "function" && window.routes?.cart_add_url) {
      try {
        cart.setActiveElement(button);
        const formData = new FormData();
        formData.append("id", variantId);
        formData.append("quantity", "1");
        if (typeof window.getCurrentSellingPlanId === "function") {
          formData.append("selling_plan", window.getCurrentSellingPlanId() || "");
        }
        formData.append("sections", cart.getSectionsToRender().map((section) => section.id));
        formData.append("sections_url", window.location.pathname);

        const config = fetchConfig("javascript");
        config.headers["X-Requested-With"] = "XMLHttpRequest";
        delete config.headers["Content-Type"];
        config.body = formData;

        const response = await fetch(window.routes.cart_add_url, config);
        const data = await response.json();

        if (data.status) {
          throw new Error(data.description || data.message || "Failed to add");
        }

        if (typeof publish === "function") {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: "cart-upsell", productVariantId: variantId });
        }
        cart.renderContents(data);
        if (cart.classList.contains("is-empty")) cart.classList.remove("is-empty");

        button.textContent = this.addedLabel;
        setTimeout(() => this.loadCart(), 500);
      } catch (error) {
        console.error("Erro ao adicionar:", error);
        button.textContent = this.errorLabel;
        button.disabled = false;
      }
      return;
    }

    try {
      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: Number(variantId), quantity: 1 }],
        }),
      });

      if (response.ok) {
        button.textContent = this.addedLabel;
        if (typeof publish === "function") {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: "cart-upsell", productVariantId: variantId });
        }
        setTimeout(() => this.loadCart(), 500);
      } else {
        throw new Error("Failed to add");
      }
    } catch (error) {
      console.error("Erro ao adicionar:", error);
      button.textContent = this.errorLabel;
      button.disabled = false;
    }
  }
}

customElements.define("cart-upsell", CartUpsell);
