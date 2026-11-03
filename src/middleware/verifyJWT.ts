import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface AuthenticatedUser {
  email: string;
  name: string;
  userId: string;
  [key: string]: any;
}




export interface AuthRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: AuthenticatedUser;
}


declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;




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







export async function verifyJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      message: 'Unauthorized: Missing or malformed Authorization header. Expected "Bearer <token>".',
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      message: 'Unauthorized: Token is missing from Authorization header.',
    });
    return;
  }

  try {
    const jwks = getJWKS();
    const { payload } = await jwtVerify(token, jwks);


    const email = (payload.email || (payload.user as any)?.email || (typeof payload.sub === 'string' ? payload.sub : '')) as string;
    const name = (payload.name || (payload.user as any)?.name || (email ? email.split('@')[0] : 'User')) as string;
    const userId = (payload.userId || payload.id || (payload.user as any)?.id || payload.sub || email) as string;

    if (!email || typeof email !== 'string' || typeof userId !== 'string' || !userId) {
      res.status(401).json({ message: 'Unauthorized: Token does not contain a valid user identity.' });
      return;
    }

    req.user = {
      email,
      name,
      userId,
      ...payload,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      message: 'Unauthorized: Invalid, expired, or untrusted authentication token.',
    });
  }
}

export default verifyJWT;
