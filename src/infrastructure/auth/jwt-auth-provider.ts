import crypto from 'node:crypto';
import { AuthClaims, IAuthenticationProvider } from '../../domain/auth/auth-provider.interface';

export class JwtAuthProvider implements IAuthenticationProvider {
  private readonly secret: string;
  private readonly issuer: string;

  constructor(
    secret?: string,
    issuer: string = 'carpool-enterprise'
  ) {
    if (secret) {
      this.secret = secret;
    } else {
      const envSecret = process.env.JWT_SECRET;
      if (!envSecret) {
        throw new Error('FATAL: JWT_SECRET environment variable is missing. It is required for local, staging, and production.');
      }
      this.secret = envSecret;
    }
    this.issuer = issuer;
  }

  private base64UrlEncode(input: string | Buffer): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  public async signToken(
    claims: Omit<AuthClaims, 'iat' | 'exp' | 'iss' | 'sub'>,
    expiresInSeconds: number = 86400 // 24 hours
  ): Promise<string> {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload: AuthClaims = {
      ...claims,
      sub: claims.userId,
      iss: this.issuer,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(signingInput)
      .digest();
    const encodedSignature = this.base64UrlEncode(signature);

    return `${signingInput}.${encodedSignature}`;
  }

  public async verifyToken(token: string): Promise<AuthClaims | null> {
    try {
      if (!token || typeof token !== 'string') {
        return null;
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts;

      // 1. Verify algorithm
      const headerStr = this.base64UrlDecode(encodedHeader);
      const header = JSON.parse(headerStr);
      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        return null;
      }

      // 2. Verify signature with timing-safe comparison
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(signingInput)
        .digest();
      const expectedSignatureEncoded = this.base64UrlEncode(expectedSignature);

      if (
        expectedSignatureEncoded.length !== encodedSignature.length ||
        !crypto.timingSafeEqual(
          Buffer.from(expectedSignatureEncoded),
          Buffer.from(encodedSignature)
        )
      ) {
        return null;
      }

      // 3. Decode payload and check expiration
      const payloadStr = this.base64UrlDecode(encodedPayload);
      const payload: AuthClaims = JSON.parse(payloadStr);

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return null; // Expired
      }

      // 4. Validate issuer
      if (payload.iss !== this.issuer) {
        return null;
      }

      if (!payload.userId || !payload.organizationId) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  public async generateToken(params: {
    userId: string;
    orgId: string;
    role?: string;
    email?: string;
  }): Promise<string> {
    return this.signToken({
      userId: params.userId,
      organizationId: params.orgId,
      email: params.email || 'user@example.com',
      capabilities: {
        can_ride: true,
        can_drive: true,
        is_org_admin: params.role === 'admin',
      },
    });
  }
}
