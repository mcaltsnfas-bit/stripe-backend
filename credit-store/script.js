async function buyCredits(amount) {
  try {
    const res = await fetch("https://stripe-backend-1-65oj.onrender.com/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ credits: amount })
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Error creating checkout");
    }

  } catch (err) {
    console.error(err);
    alert("Server error. Try again.");
  }
}