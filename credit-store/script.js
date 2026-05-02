async function buyCredits(amount) {
  try {
    const res = await fetch("http://mcalts.co.uk/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        credits: amount
      })
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      console.log("Server response:", data);
      alert("Error creating checkout");
    }

  } catch (err) {
    console.error("Fetch error:", err);
    alert("Server error. Try again.");
  }
}