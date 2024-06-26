const topicsMap = {
  Directory: {
    "0x2b4800c6e3782a86d7e9ab678e5331d9581d15aa8817ac5e31333efa631c6797": "AddedLTContract",
    "0x90cac61ae39d59971fdfbb6f5f70dd15406b1bb72f049d9978d1393a558441ba": "AllocatedLTToProject",
    "0x89e957ef9d0a04910e73bcf06e20384deb4f42d3e5eaded1573006ca16ad3a64": "AllocatedProjectOwnerToProject",
    "0x912954896ce5595e45557f32610d9253259b48847895b2394f20da5b9beb4a9d": "ChangedProjectName",
    "0x56bfc915ea0420d70e425659e8828ab2548519d66ec6cdfd792fd38a633fcccc": "ChangedProjectOwnerAccount",
    "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0": "OwnershipTransferred",
    "0xb5ab65b070e71b2da044bbd9468ab7d101c5f4d033fcc248eaeb76f96b7a0970": "ProjectOwnerWhitelisted",
    "0x36f9da31a44da5369d7007ddbe63825af02c742ecbab58251f8a8e53b9a7fb23": "RemovedLTContract",
    "0xa0c273d2a672a9e7934a76e5ae7e544c2938a1e91982bd47636884e9ca9f2049": "RemovedProjectByAdmin",
    "0x34d5714013380d0dd2de54669941a1e6ffeb94f624def9a559f03abd0e8e4a5c": "UserFunctionsAreDisabled",
  },
  ChargedToken: {
    "0xe34132c0e38d6bc3060b9c7698a52568cfc799c082cc802a370f04ff216130ee": "AllocationsAreTerminated",
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "Approval",
    "0x85d06bbafc9dfd05707e7a9369f98dcc505c964d1c4057022d7799ab84319f88": "ClaimedRewardPerShareUpdated",
    "0xe21837bef7e64daf0719e3e462b1a881d63c359c14c36a063143f9882a3a8525":
      "CurrentRewardPerShareAndStakingCheckpointUpdated",
    "0x0027b57dd0f4617eb13b9347dc92a2c7404c6bcdb2349863c760672bda494807": "DecreasedFullyChargedBalanceAndStakedLT",
    "0x7d2875641484b55002ee757b3ad03d920e7ace29b381cff35a357041b20d612e": "DecreasedPartiallyChargedBalance",
    "0x0b689c1125fd81041726a3b1b880e05c418bf6dc13562d346ebed9317cbadd6f": "FundraisingConditionsSet",
    "0x0f6ae9076fe3e43ad95110a1c5acd02c62ec5f1bf82c64f45ebd383fd6ac5f0d": "FundraisingStatusChanged",
    "0xb0ad669b2c654a9352811be6e1330332677e69548b033f2af030e16697749ef6": "IncreasedCurrentRewardPerShare",
    "0xae2006c94e89f8083efda0c0a1d0c7d6fef3ec90d68506aa822854f3ba31f9cf": "IncreasedFullyChargedBalance",
    "0x12129930c15dad4632242378dc39162db4c36a82482777c2e8f791d3752bb70f": "IncreasedStakedLT",
    "0x83460f65bdb244889b764a63576252cf32e10e1a058af241da584c1f1610e6db": "IncreasedTotalTokenAllocated",
    "0xb72c13e7fe7b7c2ac9e1b8ca3f0f5cb08bd8ca2b1c556fbf9b45c95a15a53543": "InterfaceProjectTokenIsLocked",
    "0xdbfb95fe8e19209e063b2852c867a8aa47acd7eb4ab8cf1e3ba86e046c196ad1": "InterfaceProjectTokenSet",
    "0xa984939d0059bc688e1c5458f72ad05b51fc8a6ba959556f5e2ee91c1ab8c7d2": "LTAllocatedByOwner",
    "0xda0b1409db59c0fa65c11db0aa894038350bd1ef7dd9949e74f8cd305f1ad9b0": "LTAllocatedThroughSale",
    "0x6f5036100ec84840f4ca7c243e6ca7c042949756211bdfb358406a77dc41a42e": "LTDeposited",
    "0x33ef926b7771df44fd5bf5a690410374540aa634051af1e3a6dd2f67c94a18f1": "LTReceived",
    "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0": "OwnershipTransferred",
    "0x33ba6df77b2071829f387d2122b96309cbbd439fa4b0532cfd8d5e6f7cd4dcbb": "RatioFeesToRewardHodlersUpdated",
    "0x612340ab30150a67355ab93f1438fa021ec7da49b6665a179e7a4f30528384dd": "StakingCampaignCreated",
    "0xea4585bcbbe652ce8d7648189af8436fed8469d3561fd73d3d345ba88618c20a": "TokensDischarged",
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "Transfer",
    "0x00988acfd43f666f3f315b14052086271e8cf328d38353204311e1cd514f385a":
      "UpdatedDateOfPartiallyChargedAndDecreasedStakedLT",
    "0x34d5714013380d0dd2de54669941a1e6ffeb94f624def9a559f03abd0e8e4a5c": "UserFunctionsAreDisabled",
    "0x74cd83192c2667eba495e3b4578522f84af3168fbb19d3bed7729a03bd5e2a41": "WithdrawalFeesUpdated",
  },
  InterfaceProjectToken: {
    "0xb4b04ad419c2274eff6e9471287e2802a240d33b87008b7ab31cf419ac33edc8": "ClaimFeesUpdated",
    "0xdbb56462ab3e717cdf5a8793f9f2613b64cbb6122c8863fcd2acf1d71012a2af": "IncreasedValueProjectTokenToFullRecharge",
    "0xe1cc0aa27606726a365e40c503310731e7b9e139e1deb0fb16433c0b92cd161d": "LTRecharged",
    "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0": "OwnershipTransferred",
    "0x5632e016b41e9b0ca62072624c56193ad6dec6c3160bb3a67f52299efb72d51a": "ProjectTokenReceived",
    "0x55d35b4292da305a0db36555001d795d3dfc81bae423612f33afc0869d36fef6": "StartSet",
  },
  DelegableToLT: {
    "0xa773fc96549f1de8ac995b277ab8ec1c55abe75032afbaae8351c85c07df62aa": "AddedAllTimeValidatedInterfaceProjectToken",
    "0xd70127857fab6a08d54eb6f6a01cb88ad0d3df252175f7c4b87ff5bc51092dec": "AddedInterfaceProjectToken",
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "Approval",
    "0xfbfdcb0d9662309d32afeb37ee8fce2f47dcfe0ab9bb44233c115fc19bb50b55": "InterfaceProjectTokenRemoved",
    "0xbc6ace5b6f030955a637ca41e7e5ebe2da2b4d020b70f39461e3b526a1d3d667":
      "ListOfValidatedInterfaceProjectTokenIsFinalized",
    "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0": "OwnershipTransferred",
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "Transfer",
  },
};

export default topicsMap;
