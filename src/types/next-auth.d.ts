import type { Role } from "./index";
import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    username: string;
    employeeId: string;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
      username: string;
      employeeId: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    username: string;
    employeeId: string;
  }
}
