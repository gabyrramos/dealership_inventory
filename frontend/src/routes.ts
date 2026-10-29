import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  index("./routes/home.tsx"),
  route("login", "./routes/login.tsx"),
  layout("./routes/app-layout.tsx", [
    route("vehicles", "./routes/vehicles.tsx"),
    route("vehicles/:id", "./routes/vehicle-edit.tsx"),
  ]),
] satisfies RouteConfig
