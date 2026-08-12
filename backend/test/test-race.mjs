const payload = {
    name: "Krishna",
    email: "krishna@nexusbroker.com",
    password: "SecurePass123",
    dob: "2003-01-15",
    phone_no: "9998887712",
    tax_id: "KRISH1234T",
    tax_id_type: "PAN",
    country_code: "IN"
};

const fireRequest = (label) =>
    fetch("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json().then(body => ({ label, status: res.status, body })));

// Promise.all fires both requests without waiting for either to finish first —
// this is what actually creates the race. Sequential awaits would defeat the test.
Promise.all([
    fireRequest("Request A"),
    fireRequest("Request B")
]).then(results => {
    results.forEach(r => console.log(`${r.label}: ${r.status}`, r.body));
});