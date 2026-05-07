const GBP_TO_USD = 1.25;

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
  const input = document.getElementById("search")?.value.toLowerCase() || "";
  const cards = document.querySelectorAll(".card");

  cards.forEach(card => {
    const text = card.innerText.toLowerCase();
    card.style.display = text.includes(input) ? "" : "none";
  });
}

function setButtonsLoading(amount, isLoading) {
  const buttons = document.querySelectorAll(`button[onclick*="${amount}"]`);

  buttons.forEach(button => {
    button.disabled = isLoading;

    if (isLoading) {
      button.dataset.oldText = button.innerText;
      button.innerText = "Loading...";
    } else {
      button.innerText = button.dataset.oldText || button.innerText;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const currencySelect = document.getElementById("currency");

  if (currencySelect) {
    currencySelect.addEventListener("change", updateCurrency);
    updateCurrency();
  }

  filterProducts();
});

async function buyCredits(amount) {
  setButtonsLoading(amount, true);

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
      alert("Checkout failed: " + errorText);
      return;
    }

    const data = await res.json();

    console.log("Stripe checkout response:", data);

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Error creating Stripe checkout session");
      console.error(data);
    }

  } catch (err) {
    console.error("Fetch error:", err);
    alert("Server error. Try again.");
  } finally {
    setButtonsLoading(amount, false);
  }
}

async function buyCreditsBank(amount) {
  setButtonsLoading(amount, true);

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
      alert("Bank payment failed: " + errorText);
      return;
    }

    const data = await res.json();

    console.log("GoCardless checkout response:", data);

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Error creating bank payment");
      console.error(data);
    }

  } catch (err) {
    console.error("GoCardless fetch error:", err);
    alert("Server error. Try again.");
  } finally {
    setButtonsLoading(amount, false);
  }
}