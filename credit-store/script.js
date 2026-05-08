const GBP_TO_USD = 1.25;

const PRODUCTS = {
  100: { credits: 100, gbp: 1.00 },
  200: { credits: 200, gbp: 1.80 },
  300: { credits: 300, gbp: 2.70 },
  400: { credits: 400, gbp: 3.60 },
  500: { credits: 500, gbp: 4.50 },
  750: { credits: 750, gbp: 6.50 },
  1000: { credits: 1000, gbp: 8.00 }
};

let selectedCredits = null;

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) {
    alert(message);
    return;
  }

  toast.innerText = message;
  toast.style.display = "block";

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 2800);
}

function toggleMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  if (!menu) return;

  menu.classList.toggle("open");
}

function closeMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  if (!menu) return;

  menu.classList.remove("open");
}

function formatPrice(gbp) {
  const currency = document.getElementById("currency")?.value || "GBP";

  if (currency === "USD") {
    return `$${(gbp * GBP_TO_USD).toFixed(2)}`;
  }

  return `£${gbp.toFixed(2)}`;
}

function updateCurrency() {
  const prices = document.querySelectorAll(".card-price");

  prices.forEach(price => {
    const gbp = Number(price.dataset.gbp);

    if (!gbp) return;

    price.innerText = formatPrice(gbp);
  });

  if (selectedCredits && PRODUCTS[selectedCredits]) {
    document.getElementById("checkoutPrice").innerText = formatPrice(PRODUCTS[selectedCredits].gbp);
  }
}

function filterProducts() {
  const input = document.getElementById("search")?.value.toLowerCase().trim() || "";
  const cards = document.querySelectorAll(".card");
  const noResults = document.getElementById("noResults");

  let visibleCount = 0;

  cards.forEach(card => {
    const text = `${card.innerText} ${card.dataset.product || ""}`.toLowerCase();
    const isVisible = text.includes(input);

    card.style.display = isVisible ? "" : "none";

    if (isVisible) {
      visibleCount++;
    }
  });

  if (noResults) {
    noResults.style.display = visibleCount === 0 ? "block" : "none";
  }
}

function setButtonLoading(button, isLoading, text = "Loading...") {
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    button.dataset.oldText = button.innerText;
    button.innerText = text;
  } else {
    button.innerText = button.dataset.oldText || button.innerText;
  }
}

function openCheckout(amount) {
  const product = PRODUCTS[amount];

  if (!product) {
    showToast("Invalid product selected.");
    return;
  }

  selectedCredits = amount;

  document.getElementById("checkoutTitle").innerText = `${amount} Credits`;
  document.getElementById("checkoutPrice").innerText = formatPrice(product.gbp);

  const overlay = document.getElementById("checkoutOverlay");
  overlay.classList.add("open");
}

function closeCheckout() {
  const overlay = document.getElementById("checkoutOverlay");
  overlay.classList.remove("open");
}

function closeCheckoutFromOverlay(event) {
  if (event.target.id === "checkoutOverlay") {
    closeCheckout();
  }
}

async function paySelectedBank() {
  if (!selectedCredits) {
    showToast("Choose a product first.");
    return;
  }

  const button = document.getElementById("bankPayBtn");
  await buyCreditsBank(selectedCredits, button);
}

async function paySelectedCard() {
  if (!selectedCredits) {
    showToast("Choose a product first.");
    return;
  }

  const button = document.getElementById("cardPayBtn");
  await buyCredits(selectedCredits, button);
}

document.addEventListener("DOMContentLoaded", () => {
  const currencySelect = document.getElementById("currency");

  if (currencySelect) {
    currencySelect.addEventListener("change", updateCurrency);
    updateCurrency();
  }

  filterProducts();

  document.addEventListener("click", event => {
    const navbar = document.querySelector(".navbar");
    const menu = document.getElementById("mobileMenu");

    if (!menu || !navbar) return;

    const clickedInsideMenu = menu.contains(event.target);
    const clickedInsideNavbar = navbar.contains(event.target);

    if (!clickedInsideMenu && !clickedInsideNavbar) {
      menu.classList.remove("open");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeCheckout();
      closeMobileMenu();
    }
  });
});

async function buyCredits(amount, button = null) {
  setButtonLoading(button, true, "Opening card...");

  try {
    const res = await fetch("/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        credits: amount
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Server response error:", errorText);
      showToast("Card checkout failed. Try again.");
      return;
    }

    const data = await res.json();

    console.log("Stripe checkout response:", data);

    if (data.url) {
      window.location.href = data.url;
    } else {
      showToast("Error creating card checkout.");
      console.error(data);
    }

  } catch (err) {
    console.error("Fetch error:", err);
    showToast("Server error. Try again.");
  } finally {
    setButtonLoading(button, false);
  }
}

async function buyCreditsBank(amount, button = null) {
  setButtonLoading(button, true, "Opening bank...");

  try {
    const res = await fetch("/create-gocardless-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        credits: amount
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("GoCardless response error:", errorText);
      showToast("Bank payment failed. Try card instead.");
      return;
    }

    const data = await res.json();

    console.log("GoCardless checkout response:", data);

    if (data.url) {
      window.location.href = data.url;
    } else {
      showToast("Error creating bank payment.");
      console.error(data);
    }

  } catch (err) {
    console.error("GoCardless fetch error:", err);
    showToast("Server error. Try again.");
  } finally {
    setButtonLoading(button, false);
  }
}