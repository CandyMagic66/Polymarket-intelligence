export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://gamma-api.polymarket.com/markets?limit=20&active=true&closed=false&order=volume&ascending=false"
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}