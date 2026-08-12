const errorHandler = (err, req, res, next) =>{
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err);

    if(err.code === 'ER_DUP_ENTRY'){
        return res.status(409).json({
            error: err.customClientMessage || 'A record with this data already exists.'
        });
    }

    if(err.code === 'ER_NO_REFERENCED_ROW_2'){
        return res.status(400).json({
            error: 'Referenced record does not exist.'
        });
    }

    return res.status(500).json({
        error: 'Internal server error.'
    });
};

export default errorHandler;