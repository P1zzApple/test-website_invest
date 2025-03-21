const express = require("express");
const cookieParser = require('cookie-parser');
const session = require("express-session");
const csrf = require("csurf");

const app = express();
const sessions = {};

app.set("view engine", "ejs");
app.use(express.static("public"));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("views"));
app.use(cookieParser())
app.use(
    session({
        name: "my_secure_session", // Уникальное имя куки
        secret: "SuperSecretKey123!", // Секрет для шифрования сессии
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: true, // Только по HTTPS
            httpOnly: true, // Защита от XSS
            sameSite: "strict" // Защита от CSRF
        }
    })
);
const csrfProtection = csrf({ cookie: true });

// Custom middleware
function authenticate(req, res, next) {
	if (sessions[req.session.id] != undefined) {
		console.log("You are logged in!");
		return next();
	}
	console.log("Please login");
	return res.redirect("/login");
}

// Database connection
const { Client } = require("pg");

const db = new Client({
	user: USER,
	password: PASSWORD,
	host: HOST,
	port: PORT,
	database: DB,
});

db.connect();

//Transfer coin
async function transferCoin(from, to, amount) {
	try {
		await db.query("begin");
		const text = "update profile set coin=coin+$1 where id = $2";
		await db.query(text, [amount, to]);
		await db.query(text, [-amount, from]);
		await db.query("commit");
	} catch (e) {
		await db.query("rollback");
		console.log(e);
	}
}

// Routes
// ---------- Homepage ------------
app.get("/", authenticate, async (req, res) => {
	try {
		const posts = await db.query(
			"select profile.name, post.id, post.content from profile inner join post on profile.id = post.author order by post.id desc"
		);
		res.render("home.ejs", {
			authUser: req.session.authUser,
			postCount: posts.rowCount,
			posts: posts.rows,
		});
	} catch (e) {
		res.send(e);
	}
});

// ---------- Authentication routes ----------

app.get("/login", (req, res) => {
	res.sendFile(__dirname + "/views/login.html");
});

app.post("/login", async (req, res) => {
	const { email, password } = req.body;
	console.log(req.body);
	if (!email) {
		res.json({ error: "Invalid email" });
	}
	if (!password) {
		res.json({ error: "Invalid password" });
	}

	try {
		const text = "select id, password from profile where email = $1";
		const response = await db.query(text, [email]);
		const actualPassword = response.rows[0].password;
		if (password == actualPassword) {
			req.session.authUser = response.rows[0].id;
			sessions[req.session.id] = req.session;
			console.log(sessions);
			return res.redirect("/");
		}
		console.log(actualPassword);
		res.json({ error: "Invalid Credentials" });
	} catch (e) {
		res.json({ error: e });
	}
});

// ---------------- Coin transaction ----------------
// Wrong way
app.get("/transfer", authenticate, (req, res) => {
	res.render('transfer.ejs', {authUser: req.session.authUser, csrfToken:""});
});

app.post("/sendCoins", authenticate, async (req, res) => {
    try {
        await transferCoin(req.session.authUser, req.body.to, req.body.amount);
        res.redirect('/profile/'+req.session.authUser);
    } catch(e) {
    	res.json({ error: e });
	}
});

// Right way
// app.get("/transfer", authenticate, csrfProtection, (req, res) => {
// 	res.render('transfer.ejs', {authUser: req.session.authUser, csrfToken: req.csrfToken()});
// });

// app.post("/sendCoins", authenticate, csrfProtection, async (req, res) => {
//     try {
//         await transferCoin(req.session.authUser, req.body.to, req.body.amount);
//         res.redirect('/profile/'+req.session.authUser);
//     } catch(e) {
//     	res.json({ error: e });
// 	}
// });

// ---------------- Profile ------------------

// ------------ New Post -------------

app.post("/post", authenticate, async (req, res) => {
	try {
		var query = "insert into post values(default, $1, $2)";
		await db.query(query, [req.body.content, req.session.authUser]);
		res.status(201).send();
	} catch (e) {
		console.log(e);
		res.status(500).send(e);
	}
});

app.listen(8000, () => console.log("Running at port 8000 ..."));
