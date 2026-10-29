import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, Info, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Navigate, useNavigate } from "react-router"
import { Alert, AlertDescription, AlertTitle } from "shared/components/ui/alert"
import { Button } from "shared/components/ui/button"
import { Input } from "shared/components/ui/input"
import { Label } from "shared/components/ui/label"
import { z } from "zod"
import { BrandMark } from "../components/brand"
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../constants/demo"
import { AUTH_NOTICE_KEY, ME_KEY } from "../constants/query-keys"
import { ApiError, api } from "../lib/api"
import { type AuthNotice, useMe } from "../lib/auth"

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email.").pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const me = useMe()
  const [showPassword, setShowPassword] = useState(false)
  const demoPassword = DEMO_PASSWORD // local copy so TypeScript knows it is set inside the click handler
  const notice = queryClient.getQueryData<AuthNotice>(AUTH_NOTICE_KEY) ?? null

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })

  const login = useMutation({
    mutationFn: (values: FormValues) => api.login(values.email, values.password),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(AUTH_NOTICE_KEY, null)
      queryClient.setQueryData(ME_KEY, user)
      navigate("/vehicles", { replace: true })
    },
  })

  if (me.data) return <Navigate to="/vehicles" replace />

  const error = login.error
  let errorMessage: string | null = null
  if (error instanceof ApiError) {
    if (error.code === "invalid_credentials") {
      errorMessage = "Incorrect email or password. Check them and try again."
    } else {
      errorMessage = error.message
    }
  } else if (error) {
    errorMessage = "Something went wrong. Please try again."
  }

  return (
    <div className="grid sm:grid-cols-2 items-stretch min-h-dvh">
      <div className="bg-white justify-center items-center flex-col gap-4 hidden sm:flex p-10 text-center">
        <BrandMark size={72} />
        <h1 className="text-4xl font-medium">Dealership Inventory</h1>
        <p className="text-xl text-muted-foreground max-w-sm">Sign in to view and update your dealership's vehicles.</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-8 bg-gray-100 p-4">
        <div className="sm:hidden flex flex-col items-center gap-2">
          <BrandMark size={56} />
          <h1 className="text-2xl font-medium">Dealership Inventory</h1>
        </div>
        <div className="w-full max-w-xs lg:max-w-md mx-auto p-8 space-y-6 bg-white sm:bg-gray-100 rounded-lg shadow-md sm:shadow-none">
          <h2 className="text-xl text-center font-semibold">Sign in to your account</h2>

          {notice && !error && (
            <Alert data-testid="auth-notice">
              <Info />
              <AlertTitle>{notice === "expired" ? "Your session expired" : "You've been signed out"}</AlertTitle>
              <AlertDescription>Sign in again to continue.</AlertDescription>
            </Alert>
          )}

          {errorMessage && (
            <Alert variant="destructive" data-testid="login-error">
              <TriangleAlert />
              <AlertTitle>Couldn't sign you in</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={form.handleSubmit((values) => login.mutate(values))} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                aria-invalid={!!form.formState.errors.email}
                aria-describedby="email-error"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p id="email-error" role="alert" className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                  aria-invalid={!!form.formState.errors.password}
                  aria-describedby="password-error"
                  {...form.register("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {form.formState.errors.password && (
                <p id="password-error" role="alert" className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {demoPassword && (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">Demo accounts</summary>
              <p className="mt-2">
                Password for all: <code className="font-mono text-foreground">{demoPassword}</code>
              </p>
              <ul className="mt-2 grid gap-1">
                {DEMO_ACCOUNTS.map(([email, label]) => (
                  <li key={email}>
                    <button
                      type="button"
                      className="text-left text-primary hover:underline"
                      onClick={() => {
                        form.setValue("email", email)
                        form.setValue("password", demoPassword)
                      }}
                    >
                      {label}
                    </button>{" "}
                    <span className="font-mono text-xs">{email}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
