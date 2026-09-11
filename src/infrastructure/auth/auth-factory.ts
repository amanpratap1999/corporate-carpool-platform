import { IAuthenticationProvider } from '../../domain/auth/auth-provider.interface';
import { JwtAuthProvider } from './jwt-auth-provider';

let authProviderInstance: IAuthenticationProvider | null = null;

/**
 * Always returns a JwtAuthProvider.
 * JWT_SECRET is required in every application runtime. Tests must inject an
 * explicit JwtAuthProvider with a test secret through setAuthProvider().
 */
export function getAuthProvider(): IAuthenticationProvider {
  if (!authProviderInstance) {
    authProviderInstance = new JwtAuthProvider();
  }
  return authProviderInstance;
}

export function setAuthProvider(provider: IAuthenticationProvider | null): void {
  authProviderInstance = provider;
}
