import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  const jwksUrl = process.env.AUTH_JWKS_URL;
  if (!jwksUrl) {
    return null;
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

export interface AuthenticatedRequest extends Request {
  user?: any;
}

/**
 * Optional or required JWT verification middleware using jose and AUTH_JWKS_URL.
 */
export async function verifyAuthToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  const remoteJWKS = getJWKS();

  if (!remoteJWKS) {
    // If JWKS URL is not configured, proceed without strict verification
    return next();
  }

  try {
    const { payload } = await jwtVerify(token, remoteJWKS);
    req.user = payload;
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: 'Authentication token is invalid or has expired.',
      error: error.message,
    });
  }
}
