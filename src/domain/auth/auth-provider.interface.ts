/**
 * Authentication Provider Port & Types
 * Clean Architecture domain contract for authentication and claims resolution
 */

export interface AuthClaims {
  userId: string;
  organizationId: string;
  email: string;
  capabilities: {
    can_ride: boolean;
    can_drive: boolean;
    is_org_admin: boolean;
  };
  iat?: number;
  exp?: number;
  iss?: string;
  sub?: string;
}

export interface IAuthenticationProvider {
  /**
   * Signs a JWT/session token containing user claims
   */
  signToken(claims: Omit<AuthClaims, 'iat' | 'exp' | 'iss' | 'sub'>, expiresInSeconds?: number): Promise<string>;

  /**
   * Verifies and decodes a token, returning claims or null if invalid/expired
   */
  verifyToken(token: string): Promise<AuthClaims | null>;
}
