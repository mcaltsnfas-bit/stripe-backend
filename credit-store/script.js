const GBP_TO_USD = 1.25;

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

function updateCurrency() {
  const currency = document.getElementById("currency")?.value || "GBP";
  const prices = document.querySelectorAll(".card-price");

  prices.forEach(price => {
    const gbp = Number(price.dataset.gbp);

    if (!gbp) return;

    if (currency === "USD") {
      const usd = gbp * GBP_TO_USD;
      price.innerText = `$${usd.toFixed(2)}`;
    } else {
      price.innerText = `£${gbp.toFixed(2)}`;
    }
  });
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

function setButtonLoading(button, isLoading) {
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    button.dataset.oldText = button.innerText;
    button.innerText = "Loading...";
  } else {
    button.innerText = button.dataset.oldText || button.innerText;
  }
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
});

async function buyCredits(amount, button = null) {
  setButtonLoading(button, true);

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
  setButtonLoading(button, true);

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