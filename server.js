if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
const methodOverride = require("method-override");
const http = require("http");
const socketio = require("socket.io");
const server = http.createServer(app);
const formatMessage = require("./utils/messages");
const {
  userJoin,
  getCurrentUser,
  getRoomUsers,
  userLeave,
} = require("./utils/users");

const io = socketio(server);

const initializePassport = require("./passport-config");
const { static } = require("express");
initializePassport(
  passport,
  (email) => users.find((user) => user.email === email),
  (id) => users.find((user) => user.id === id)
);

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.redirect("/login");
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    res.redirect("/");
  }
  next();
}

const users = [];

app.use("/public", express.static("public"));

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`server started at http://localhost:${PORT}`);
});

// app.engine("html", require("ejs").renderFile);
app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: false }));
app.use(flash());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride("_method"));

app.post(
  "/login",
  checkNotAuthenticated,
  passport.authenticate("local", {
    successRedirect: "/join", // somwhere else
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.get("/", checkAuthenticated, (req, res) => {
  return res.redirect("register", { name: req.user.name });
});

app.use("/room", (req, res) => {
  return res.render("room.ejs");
});

app.get("/join", checkAuthenticated, (req, res) => {
  res.render("join");
  res.end();
});

app.get("/register", checkNotAuthenticated, (req, res) => {
  return res.render("register");
});

app.get("/login", checkNotAuthenticated, (req, res) => {
  return res.render("index");
});

app.post("/register", checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    users.push({
      id: Date.now().toString(),
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword,
    });
    res.redirect("/login");
    res.end();
  } catch (e) {
    console.log(e); 
  }
});

// ................................................ Chat App PART ......................................................
const botName = "Admin Bot";

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ username, room }) => {
    const user = userJoin(socket.id, username, room);

    socket.join(user.room);

    socket.emit("message", formatMessage(botName, "Weclome To Chat App..!"));

    socket.broadcast
      .to(user.room)
      .emit(
        "message",
        formatMessage(botName, `(${user.username}) Has Joined The Room`)
      );

    io.to(user.room).emit("roomUsers", {
      room: user.room,
      users: getRoomUsers(user.room),
    });
    socket.on("disconnect", () => {
      const user = userLeave(socket.id);

      if (user) {
        io.to(user.room).emit(
          "message",
          formatMessage(botName, `(${user.username}) Has Left The Room`)
        );
        io.to(user.room).emit("roomUsers", {
          room: user.room,
          users: getRoomUsers(users.room),
        });
      }
    });
  });

  socket.on("chatMessage", (msg) => {
    const user = getCurrentUser(socket.id);
    io.to(user.room).emit("message", formatMessage(user.username, msg));
  });
});
