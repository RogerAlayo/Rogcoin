const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('../blockchain');
const uuid = require('uuid/v1');
const port = process.argv[2];
const rp = require('request-promise');

const nodeAddress = uuid().split('-').join('');

const rogcoin = new Blockchain();


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


// get entire blockchain
app.get('/blockchain', function (req, res) {
    res.send(rogcoin);
});


// create a new transaction
app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    const blockIndex = rogcoin.addTransactionToPendingTransactions(newTransaction);
    res.json({ note: `Transaction added to block ${blockIndex}.` });
});


// broadcast transaction
app.post('/transaction/broadcast', function (req, res) {
    const newTransaction = rogcoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    rogcoin.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];

    for(let i = 0; i < (rogcoin.networkNodes).length; ++i){
        const requestOptions = {
            uri: rogcoin.networkNodes[i] + '/transaction',  //networkNodes
            method: 'POST',
            body: newTransaction,
            json: true
        }

        requestPromises[requestPromises.length] = rp(requestOptions);        
    };

    Promise.all(requestPromises)
        .then(data => {
            res.json({ note: 'Transaction generated and broadcasted successfully.' });
        });
});
 

// mine a block
app.get('/mine', function (req, res) {
    const lastBlock = rogcoin.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: rogcoin.pendingTransactions,  //pendingTransactions
        index: lastBlock['index'] + 1
    };
    const nonce = rogcoin.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = rogcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
    const newBlock = rogcoin.createNewBlock(nonce, previousBlockHash, blockHash);

    const requestPromises = [];

    for (let i = 0; i < (rogcoin.networkNodes).length; ++i) {    
        const requestOptions = {
            uri: rogcoin.networkNodes[i] + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true
        };
        
        requestPromises[requestPromises.length] = rp(requestOptions);
    };

    Promise.all(requestPromises)
        .then(data => {
            const requestOptions = {
                uri: rogcoin.currentNodeUrl + '/transaction/broadcast', //currentNodeUrl
                method: 'POST',
                body: {
                    amount: 12.5,
                    sender: "00",
                    recipient: nodeAddress
                },
                json: true
            };

            return rp(requestOptions);
        })
        .then(data => {
            res.json({
                note: "New block mined & broadcast successfully",
                block: newBlock
            });
        });
});


// receive new block
app.post('/receive-new-block', function (req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = rogcoin.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if (correctHash && correctIndex) {
        (rogcoin.chain)[(rogcoin.chain).length] = newBlock; //rogcoin.chain.push(newBlock); //check
        rogcoin.pendingTransactions = [];   //pendingTransactions
        res.json({
            note: 'New block received and accepted.',
            newBlock: newBlock
        });
    } else {
        res.json({
            note: 'New block rejected.',
            newBlock: newBlock
        });
    }
});


// register a node and broadcast it the network
app.post('/register-and-broadcast-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (rogcoin.networkNodes.indexOf(newNodeUrl) == -1) {
        rogcoin.networkNodes[(rogcoin.networkNodes).length] = newNodeUrl; //networkNodes (2)  //check
    }
    const regNodesPromises = [];

    for (let i = 0; i < (rogcoin.networkNodes).length; ++i) { 
        const requestOptions = {
            uri: rogcoin.networkNodes[i] + '/register-node',
            method: 'POST',
            body: { newNodeUrl: newNodeUrl },
            json: true
        };

        regNodesPromises[regNodesPromises.length] = rp(requestOptions);
    };

    Promise.all(regNodesPromises)
        .then(data => {
            const bulkRegisterOptions = {
                uri: newNodeUrl + '/register-nodes-bulk',
                method: 'POST',
                body: { allNetworkNodes: [...rogcoin.networkNodes, rogcoin.currentNodeUrl] },    //networkNodes &currentNodeUrl
                json: true
            };

            return rp(bulkRegisterOptions);
        })
        .then(data => {
            res.json({ note: 'New node registered with network successfully.' });
        });
});


// register a node with the network
app.post('/register-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = rogcoin.networkNodes.indexOf(newNodeUrl) == -1;   //networkNodes
    const notCurrentNode = rogcoin.currentNodeUrl !== newNodeUrl;   //currentNodeUrl
    if (nodeNotAlreadyPresent && notCurrentNode) {
        rogcoin.networkNodes[(rogcoin.networkNodes).length] = newNodeUrl; 
    }
    res.json({ note: 'New node registered successfully.' });
});


// register multiple nodes at once
app.post('/register-nodes-bulk', function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;

    for (let i = 0; i < allNetworkNodes.length; ++i) { 
        const nodeNotAlreadyPresent = rogcoin.networkNodes.indexOf(allNetworkNodes[i]) == -1;   //networkNodes
        const notCurrentNode = rogcoin.currentNodeUrl !== allNetworkNodes[i];   //currentNodeUrl
        if (nodeNotAlreadyPresent && notCurrentNode) {
            rogcoin.networkNodes[(rogcoin.networkNodes).length] = allNetworkNodes[i]; 
        }
    }
    
    res.json({ note: 'Bulk registration successful.' });
});

// consensus
app.get('/consensus', function (req, res) {
    const requestPromises = [];

    for (let i = 0; i < (rogcoin.networkNodes).length; ++i) {     //networkNodes
        const requestOptions = {
            uri: rogcoin.networkNodes[i] + '/blockchain',
            method: 'GET',
            json: true
        };

        requestPromises[requestPromises.length] = rp(requestOptions);
    };

    Promise.all(requestPromises)
        .then(blockchains => {
            const currentChainLength = (rogcoin.chain).length;    //chain
            let maxChainLength = currentChainLength;
            let newLongestChain = null;
            let newPendingTransactions = null;
            
            for (let i = 0; i < blockchains.length; ++i) {   
                if (((blockchains[i]).chain).length > maxChainLength) { //chain
                    maxChainLength = ((blockchains[i]).chain).length;   //chain
                    newLongestChain = (blockchains[i]).chain;         //chain
                    newPendingTransactions = (blockchains[i]).pendingTransactions;    //pendingTransactions
                };
            };

            if (!newLongestChain || (newLongestChain && !rogcoin.chainIsValid(newLongestChain))) {
                res.json({
                    note: 'Current chain has not been replaced.',
                    chain: rogcoin.chain    //chain
                });
            }
            else {
                rogcoin.chain = newLongestChain;    //chain
                rogcoin.pendingTransactions = newPendingTransactions;   //pendingTransactions
                res.json({
                    note: 'This chain has been replaced.',
                    chain: rogcoin.chain    //chain
                });
            }
        });
});


// get block by blockHash
app.get('/block/:blockHash', function (req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = rogcoin.getBlock(blockHash);
    res.json({
        block: correctBlock
    });
});


// get transaction by transactionId
app.get('/transaction/:transactionId', function (req, res) {
    const transactionId = req.params.transactionId;
    const trasactionData = rogcoin.getTransaction(transactionId);
    res.json({
        transaction: trasactionData.transaction,
        block: trasactionData.block
    });
});


// get address by address
app.get('/address/:address', function (req, res) {
    const address = req.params.address;
    const addressData = rogcoin.getAddressData(address);
    res.json({
        addressData: addressData
    });
});


// block explorer
app.get('/block-explorer', function (req, res) {
    res.sendFile('./block-explorer/index.html', { root: __dirname });
});


app.listen(port, function () {
    console.log(`Listening on port ${port}...`);
});