async function buyCredits(amount) {
  try {
    const res = await fetch("http://77.68.102.124:3000/create-checkout", {
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