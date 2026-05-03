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

document.addEventListener("DOMContentLoaded", () => {
  const currencySelect = document.getElementById("currency");

  if (currencySelect) {
    currencySelect.addEventListener("change", updateCurrency);
    updateCurrency();
  }
});

async function buyCredits(amount) {
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

    console.log("Checkout response:", data);

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Error creating checkout session");
      console.error(data);
    }

  } catch (err) {
    console.error("Fetch error:", err);
    alert("Server error. Try again.");
  }
}