import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/admin/acceso",
  },
});

export const config = {
  matcher: ["/admin/((?!acceso).*)"],
};
