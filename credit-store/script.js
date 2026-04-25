async function buyCredits(amount) {
  try {
    const res = await fetch("https://mcalts.co.uk/create-checkout", {
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
      console.error("Checkout error response:", data);
      alert(data.error || "Error creating checkout");
    }

  } catch (err) {
    console.error("Fetch error:", err);
    alert("Server error. Try again.");
  }
}