import chains from '@safe-global/utils/config/chains'
import { getSafeL2SingletonDeployments, getSafeSingletonDeployments } from '@safe-global/safe-deployments'
import ExternalStore from '@safe-global/utils/services/ExternalStore'
import { Gnosis_safe__factory } from '@safe-global/utils/types/contracts'
import Safe from '@safe-global/protocol-kit'
import { isValidMasterCopy } from '@safe-global/utils/services/contracts/safeContracts'
import { isPredictedSafeProps, isReplayedSafeProps } from '@/features/counterfactual/utils'
import { isLegacyVersion } from '@safe-global/utils/services/contracts/utils'
import { isInDeployments } from '@safe-global/utils/hooks/coreSDK/utils'
import type { SafeCoreSDKProps } from '@safe-global/utils/hooks/coreSDK/types'

// Safe Core SDK
export const initSafeSDK = async ({
  provider,
  chainId,
  address,
  version,
  implementationVersionState,
  implementation,
  undeployedSafe,
}: SafeCoreSDKProps): Promise<Safe | undefined> => {
  const providerNetwork = (await provider.getNetwork()).chainId
  console.log('providerNetwork:', providerNetwork, 'chainId:', chainId)
  if (providerNetwork !== BigInt(chainId)) {
    return
  }

  const safeVersion = version ?? (await Gnosis_safe__factory.connect(address, provider).VERSION())
  let isL1SafeSingleton = chainId === chains.eth
  console.log('implementationVersionState:', implementationVersionState)

  console.log('isValidMasterCopy:', isValidMasterCopy(implementationVersionState))
  // If it is an official deployment we should still initiate the safeSDK
  if (!isValidMasterCopy(implementationVersionState)) {
    const masterCopy = implementation

    const safeL1Deployment = getSafeSingletonDeployments({ network: chainId, version: safeVersion })
    const safeL2Deployment = getSafeL2SingletonDeployments({ network: chainId, version: safeVersion })

    console.log('🔍 Deployments fetched:', {
      chainId,
      safeVersion,
      masterCopy,
      safeL1Addresses: safeL1Deployment?.networkAddresses?.[chainId],
      safeL2Addresses: safeL2Deployment?.networkAddresses?.[chainId],
    })

    isL1SafeSingleton = isInDeployments(masterCopy, safeL1Deployment?.networkAddresses[chainId])
    const isL2SafeMasterCopy = isInDeployments(masterCopy, safeL2Deployment?.networkAddresses[chainId])

    console.log('Deployment check:', { isL1SafeSingleton, isL2SafeMasterCopy })

    // Unknown deployment, which we do not want to support
    if (!isL1SafeSingleton && !isL2SafeMasterCopy) {
      console.error('Unknown deployment - returning undefined!')
      return Promise.resolve(undefined)
    }
  }
  // Legacy Safe contracts
  if (isLegacyVersion(safeVersion)) {
    console.log('Legacy version detected, forcing L1 singleton')
    isL1SafeSingleton = true
  }
  console.log('Final isL1SafeSingleton:', isL1SafeSingleton)

  if (undeployedSafe) {
    console.log('Undeployed safe detected')
    if (isPredictedSafeProps(undeployedSafe.props) || isReplayedSafeProps(undeployedSafe.props)) {
      return Safe.init({
        provider: provider._getConnection().url,
        isL1SafeSingleton,
        predictedSafe: undeployedSafe.props,
      })
    }
    // We cannot initialize a Core SDK for replayed Safes yet.
    return
  }
  console.log('Initializing Safe SDK...')
  return Safe.init({
    provider: provider._getConnection().url,
    safeAddress: address,
    isL1SafeSingleton,
  })
}

export const {
  getStore: getSafeSDK,
  setStore: setSafeSDK,
  useStore: useSafeSDK,
} = new ExternalStore<Safe | undefined>()
