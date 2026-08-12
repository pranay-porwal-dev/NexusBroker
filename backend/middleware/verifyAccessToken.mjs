import jwt from "jsonwebtoken";

export const verifyAccessToken = (req,res,next)=>{
    const accessToken = req.cookies?.ACCESS_TOKEN;
    if(!accessToken){
        return res.status(401).json({
            error: "Not authenticated."
        });
    }
    try{
        const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
        req.userId = decoded.sub;
        next();
    }catch(err){
        return res.status(401).json({
            error: "Invalid or expired access token"
        });
    }
}