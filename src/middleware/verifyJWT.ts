import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface AuthenticatedUser {
  email: string;
  name: string;
  [key: string]: any;
}

/**
 * Extended Express Request interface carrying verified BetterAuth user claims.
 */
export interface AuthRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: AuthenticatedUser;
}

// Augment Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Returns or initializes the cached JWKS client using AUTH_JWKS_URL.
 */
function getJWKS() {
  const jwksUrl = process.env.AUTH_JWKS_URL;
  if (!jwksUrl) {
    throw new Error('AUTH_JWKS_URL is not defined in environment variables.');
  }

  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(new URL(jwksUrl));
  }

  return cachedJWKS;
}

/**
 * Express middleware to verify BetterAuth JWT tokens via the remote JWKS endpoint.
 * - Reads "Authorization: Bearer <token>"
 * - On success attaches req.user = { email, name }
 * - On failure returns 401 JSON
 */
export async function verifyJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Missing or malformed Authorization header. Expected "Bearer <token>".',
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Token is missing from Authorization header.',
    });
    return;
  }

  try {
    const jwks = getJWKS();
    const { payload } = await jwtVerify(token, jwks);

    // Extract user email and name from BetterAuth JWT payload
    const email = (payload.email || (payload.user as any)?.email || (typeof payload.sub === 'string' ? payload.sub : '')) as string;
    const name = (payload.name || (payload.user as any)?.name || (email ? email.split('@')[0] : 'User')) as string;

    req.user = {
      email,
      name,
      ...payload,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid, expired, or untrusted authentication token.',
      error: error.message,
    });
  }
}

export default verifyJWT;
