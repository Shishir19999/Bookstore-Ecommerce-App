import { useEffect, useState } from "react";
import ProductItem from "./ProductItem";
import { api } from "../api";

const PAGE_SIZE = 8;

const ProductList = () => {
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [genre, setGenre] = useState("");
	const [page, setPage] = useState(1);
	const [data, setData] = useState({ books: [], pages: 1, genres: [] });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Debounce the search box
	useEffect(() => {
		const t = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(1);
		}, 300);
		return () => clearTimeout(t);
	}, [searchInput]);

	useEffect(() => {
		let cancelled = false;
		const params = new URLSearchParams({ page, limit: PAGE_SIZE });
		if (search) params.set("search", search);
		if (genre) params.set("genre", genre);

		// eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
		setLoading(true);
		api(`/api/books?${params}`)
			.then((d) => {
				if (cancelled) return;
				setData(d);
				setError("");
			})
			.catch((err) => !cancelled && setError(err.message))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [search, genre, page]);

	return (
		<div className="prdt-list">
			<h2 style={{ color: "green" }}>Book List</h2>
			<div className="filter-btn">
				<input
					type="search"
					placeholder="Search title or author"
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
				/>
				<label>
					Genre:
					<select
						value={genre}
						onChange={(e) => {
							setGenre(e.target.value);
							setPage(1);
						}}
					>
						<option value="">All</option>
						{data.genres.map((g) => (
							<option key={g} value={g}>{g}</option>
						))}
					</select>
				</label>
			</div>

			{error && <p className="error" role="alert">{error}</p>}
			{loading && <p className="msg">Loading...</p>}
			{!loading && !error && data.books.length === 0 && <p className="msg">No books found.</p>}

			<ul className="item-card">
				{data.books.map((product) => (
					<ProductItem key={product._id} product={product} />
				))}
			</ul>

			<div className="pagination">
				<button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
				<span>Page {data.page || page} of {data.pages}</span>
				<button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
			</div>
		</div>
	);
};

export default ProductList;
