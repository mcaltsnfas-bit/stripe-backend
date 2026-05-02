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