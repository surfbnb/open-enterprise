import { AppView, AppBar, Main, observe, SidePanel, TabBar, Root, Viewport, font, breakpoint } from '@aragon/ui'
import PropTypes from 'prop-types'
import React from 'react'
import styled from 'styled-components'
import { map } from 'rxjs/operators'
import throttle from 'lodash.throttle'
import { Overview, MyRewards } from '../Content'
import { Title } from '../Shared'
import { Empty } from '../Card'
import PanelManager, { PANELS } from '../Panel'
import NewRewardButton from './NewRewardButton'
import { millisecondsToBlocks, MILLISECONDS_IN_A_MONTH, millisecondsToQuarters, WEEK } from '../../../../../shared/ui/utils'
import BigNumber from 'bignumber.js'
import { networkContextType, MenuButton } from '../../../../../shared/ui'

const CONVERT_API_BASE = 'https://min-api.cryptocompare.com/data'
const CONVERT_THROTTLE_TIME = 5000

const convertApiUrl = symbols =>
  `${CONVERT_API_BASE}/price?fsym=USD&tsyms=${symbols.join(',')}`

class App extends React.Component {
  static propTypes = {
    app: PropTypes.object.isRequired,
    rewards: PropTypes.arrayOf(PropTypes.object),
    balances: PropTypes.arrayOf(PropTypes.object),
  }

  constructor(props) {
    super(props)

    this.state = {
      selected: 0,
      tabs: [ 'Overview', 'My Rewards' ],
    }
    this.updateRewards()
  }

  static defaultProps = {
    network: {},
  }

  static childContextTypes = {
    network: networkContextType,
  }

  getChildContext() {
    const { network } = this.props
    return {
      network: {
        type: network.type,
      },
    }
  }

  componentDidUpdate(prevProps) {
    this.updateConvertedRates(this.props)
  }

  updateConvertedRates = throttle(async ({ balances = [] }) => {
    const verifiedSymbols = balances
      .filter(({ verified }) => verified)
      .map(({ symbol }) => symbol)

    if (!verifiedSymbols.length) {
      return
    }

    const res = await fetch(convertApiUrl(verifiedSymbols))
    const convertRates = await res.json()
    console.log(this.state.convertRates, convertRates)
    if (JSON.stringify(this.state.convertRates) !== JSON.stringify(convertRates)) {
      console.log('updating conversion rates')
      this.setState({ convertRates })
    }
  }, CONVERT_THROTTLE_TIME)

  updateRewards = async () => {
    this.props.app.cache('requestRefresh', {
      event: 'RefreshRewards'
    })
  }

  handleMenuPanelOpen = () => {
    window.parent.postMessage(
      { from: 'app', name: 'menuPanel', value: true }, '*'
    )
  }

  closePanel = () => {
    this.setState({ panel: undefined, panelProps: undefined })
  }

  selectTab = idx => {
    this.setState({ selected: idx })
    this.updateRewards()
  }

  getRewards = (rewards) => {
    return rewards === undefined ? [] : rewards
  }

  newReward = () => {
    this.setState({
      panel: PANELS.NewReward,
      panelProps: {
        onNewReward: this.onNewReward,
        vaultBalance: '432.9 ETH',
        balances: this.props.balances,
      },
    })
  }

  onNewReward = async reward => {
    let currentBlock = await this.props.app.web3Eth('getBlockNumber').toPromise()
    let startBlock = currentBlock + millisecondsToBlocks(Date.now(), reward.dateStart)
    if (!reward.isMerit) {
      switch (reward.disbursementCycle) {
      case 'Quarterly':
        reward.occurances = millisecondsToQuarters(reward.dateStart, reward.dateEnd)
        reward.duration = millisecondsToBlocks(Date.now(), 3 * MILLISECONDS_IN_A_MONTH + Date.now())
        break
      default: // Monthly
        reward.occurances = 12
        reward.duration = millisecondsToBlocks(Date.now(), MILLISECONDS_IN_A_MONTH + Date.now())
      }
      switch(reward.disbursementDelay) {
      case '1 week':
        reward.delay = millisecondsToBlocks(Date.now(), Date.now + WEEK)
        break
      case '2 weeks':
        reward.delay = millisecondsToBlocks(Date.now(), Date.now + (2 * WEEK))
        break
      default:
        reward.delay = 0
        break
      }
    }
    else {
      reward.occurances = 1
      reward.delay = 0
      reward.duration = millisecondsToBlocks(reward.dateStart, reward.dateEnd)
    }
    this.props.app.newReward(
      reward.description, //string _description
      reward.isMerit, //bool _isMerit,
      reward.referenceAsset, //address _referenceToken,
      reward.currency, //address _rewardToken,
      reward.amount, //uint _amount,
      startBlock, // uint _startBlock
      reward.duration, //uint _duration, (number of blocks until reward will be available)
      reward.occurances, //uint _occurances,
      reward.delay //uint _delay
    )
    this.closePanel()
  }

  onClaimReward = reward => {
    this.props.app.claimReward(Number(reward.rewardId))
    this.closePanel()
  }

  myReward = reward => {
    this.setState({
      panel: PANELS.MyReward,
      panelProps: {
        onClaimReward: this.onClaimReward,
        onClosePanel: this.closePanel,
        vaultBalance: '432.9 ETH',
        reward,
        tokens: this.props.balances,
      },
    })
  }

  viewReward = reward => {
    this.setState({
      panel: PANELS.ViewReward,
      panelProps: {
        reward: reward,
        tokens: this.props.balances,
        onClosePanel: this.closePanel,
        network: { type: 'rinkeby' }
      }
    })
  }

  openDetailsView = reward => {
    this.viewReward(reward)
  }
  openDetailsMy = reward => {
    this.myReward(reward)
  }

  render() {
    const { panel, panelProps } = this.state
    const { network, balances } = this.props

    return (
      <Root.Provider>
        <StyledAragonApp>
          <AppView
            title="Rewards"

            appBar={
              <AppBar
                endContent={
                  <NewRewardButton
                    title="New Reward"
                    onClick={this.newReward}
                  />
                }
                tabs={
                  <TabBar
                    items={this.state.tabs}
                    selected={this.state.selected}
                    onChange={this.selectTab}
                  />
                }
              >
                <AppBarTitle>
                  <Viewport>
                    {({ below }) =>
                      below('medium') && <MenuButton onClick={this.handleMenuPanelOpen} />
                    }
                  </Viewport>
                  <AppBarLabel>Rewards</AppBarLabel>
                </AppBarTitle>
              </AppBar>
            }
          >


            { this.state.selected === 1 ? (
              <MyRewards
                rewards={this.getRewards(this.props.rewards)}
                newReward={this.newReward}
                openDetails={this.openDetailsMy}
                network={network}
                onClaimReward={this.onClaimReward}
                tokens={this.props.balances}
                convertRates={this.state.convertRates}
              />
            ) : (
              <Overview
                rewards={this.getRewards(this.props.rewards)}
                newReward={this.newReward}
                openDetails={this.openDetailsView}
                network={network}
                tokens={this.props.balances}
                convertRates={this.state.convertRates}
                claims={this.props.claims}
              />
            )}

          </AppView>
          <PanelManager
            onClose={this.closePanel}
            activePanel={panel}
            {...panelProps}
          />
        </StyledAragonApp>
      </Root.Provider>
    )
  }
}

const StyledAragonApp = styled(Main)`
  display: flex;
  height: 100vh;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
`
const AppBarTitle = styled.span`
  display: flex;
  align-items: center;
`

const AppBarLabel = styled.span`
  margin: 0 10px 0 8px;
  ${font({ size: 'xxlarge' })};

  ${breakpoint(
    'medium',
    `
      margin-left: 24px;
    `
  )};
`

export default observe(
  observable => observable.pipe(map(state => ({ ...state }))),
  {}
)(App)
